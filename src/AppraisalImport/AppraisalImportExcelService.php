<?php

declare(strict_types=1);

namespace App\AppraisalImport;

use App\Entity\Appraisal;
use App\Entity\CareerPlan;
use App\Entity\Comment;
use App\Entity\DevelopmentNeed;
use App\Entity\GrowthPlan;
use App\Entity\KeyDeliverable;
use App\Entity\StrengthWeakness;
use App\Entity\TrainingNeed;
use App\Entity\User;
use App\Enum\AppraisalPartyRole;
use App\Enum\AppraisalStatus;
use App\Enum\GrowthPlanPriority;
use App\Enum\StrengthWeaknessType;
use App\Enum\TrainingNeedPriority;
use App\Enum\TrainingNeedType;
use App\Repository\BscPerspectiveRepository;
use App\Repository\CompetencyRatingRepository;
use App\Repository\CompetencyRepository;
use App\Repository\GrowthPlanRepository;
use App\Repository\KeyDeliverableRepository;
use App\Service\AuditService;
use App\Service\ScoreEngine;
use Doctrine\DBAL\LockMode;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Uid\Uuid;

/**
 * Port of services.import_excel_service (TASK-064/065): imports a
 * single .xls file into ONE existing appraisal (SELF_ASSESSMENT only),
 * as opposed to AppraisalBulkImportPreviewService/Executor's HR-wide
 * multi-file flow elsewhere in this namespace.
 */
final class AppraisalImportExcelService
{
    public const MAX_FILE_SIZE = 5 * 1024 * 1024;

    private const WEIGHT_TOLERANCE = '0.001';

    public function __construct(
        private readonly ExcelParser $excelParser,
        private readonly BscPerspectiveRepository $perspectives,
        private readonly CompetencyRepository $competencies,
        private readonly CompetencyRatingRepository $competencyRatings,
        private readonly KeyDeliverableRepository $keyDeliverables,
        private readonly GrowthPlanRepository $growthPlans,
        private readonly ScoreEngine $scoreEngine,
        private readonly EntityManagerInterface $em,
        private readonly AuditService $auditService,
    ) {
    }

    public function import(string $appraisalId, User $requestingUser, string $fileBytes, ?string $fileName = null): ImportExcelOutcome
    {
        try {
            [$parsedSheet, $workbook] = $this->excelParser->parsePerformanceAppraisalSheet($fileBytes);
        } catch (ExcelParseException $exc) {
            return ImportExcelOutcome::parseError($exc->errorCode);
        }

        $growthPlan = null;
        try {
            $growthPlan = $this->excelParser->parseGrowthPlansSheet($workbook);
        } catch (\Throwable) {
            // Growth plan parsing failure is non-fatal, matching Django.
        }

        return $this->em->wrapInTransaction(function () use ($appraisalId, $requestingUser, $parsedSheet, $growthPlan, $fileName): ImportExcelOutcome {
            $appraisal = $this->em->find(Appraisal::class, Uuid::fromString($appraisalId), LockMode::PESSIMISTIC_WRITE);
            if ($appraisal === null) {
                return ImportExcelOutcome::notFound();
            }

            if ($appraisal->getStatus() !== AppraisalStatus::SELF_ASSESSMENT) {
                return ImportExcelOutcome::statusNotAllowed();
            }

            if ($appraisal->getFormType()->value !== $parsedSheet->formType) {
                return ImportExcelOutcome::parseError('FORM_TYPE_MISMATCH');
            }

            $warnings = [];
            $weightWarning = $this->buildKdWeightWarning($parsedSheet->kdWeightsSum);
            if ($weightWarning !== null) {
                $warnings[] = $weightWarning;
            }

            foreach ($this->keyDeliverables->findAllByAppraisal($appraisal) as $existingKd) {
                $this->em->remove($existingKd);
            }
            $this->em->flush();

            $perspectiveMap = [];
            foreach ($this->perspectives->findAllOrderedBySortOrder() as $perspective) {
                $perspectiveMap[strtolower($perspective->getName())] = $perspective;
            }

            $kdCount = 0;
            foreach ($parsedSheet->keyDeliverables as $kd) {
                $perspective = $perspectiveMap[strtolower(trim($kd->perspectiveName))] ?? null;
                if ($perspective === null) {
                    $warnings[] = sprintf(
                        "BSC Perspective '%s' not matched -- skipped KD '%s'",
                        $kd->perspectiveName,
                        mb_substr($kd->description, 0, 50),
                    );
                    continue;
                }

                $entity = new KeyDeliverable($appraisal, $perspective, $kd->description, $kd->weight);
                $entity->setSortOrder($kd->sortOrder);
                $entity->setManagerRating($kd->managerRating);
                $entity->setSelfRating($kd->selfRating);
                $this->em->persist($entity);
                ++$kdCount;
            }
            $this->em->flush();

            $competencyMap = [];
            foreach ($this->competencies->findAllOrderedBySortOrder(true) as $competency) {
                $competencyMap[strtolower($competency->getName())] = $competency;
            }

            $competencyCount = 0;
            foreach ($parsedSheet->competencyRatings as $cr) {
                $competency = $competencyMap[strtolower(trim($cr->competencyName))] ?? null;
                if ($competency === null) {
                    $warnings[] = sprintf("Competency '%s' not matched -- skipped", $cr->competencyName);
                    continue;
                }

                // Mirrors Django's .filter(...).update(...): only updates
                // an EXISTING CompetencyRating row (created at cycle
                // activation) — never creates a new one here.
                $rating = $this->competencyRatings->findOneByAppraisalAndCompetency($appraisal, $competency);
                if ($rating !== null) {
                    $rating->setManagerRating($cr->managerRating);
                    ++$competencyCount;
                }
            }
            $this->em->flush();

            $commentsImported = 0;
            foreach ($parsedSheet->comments as $comment) {
                if (trim($comment->content) === '') {
                    continue;
                }
                $this->em->persist(new Comment($appraisal, $requestingUser, AppraisalPartyRole::from($comment->authorRole), $comment->content));
                ++$commentsImported;
            }
            $this->em->flush();

            $this->scoreEngine->computeScores($appraisal);

            $growthPlanImported = false;
            $strengthsCount = 0;
            $weaknessesCount = 0;
            $trainingNeedsCount = 0;

            if ($growthPlan !== null) {
                foreach ($growthPlan->emptySections as $section) {
                    $warnings[] = sprintf("Growth plan section '%s' is blank -- skipped", $section);
                }

                $existingGrowthPlan = $this->growthPlans->findOneByAppraisal($appraisal);
                if ($existingGrowthPlan !== null) {
                    $this->em->remove($existingGrowthPlan);
                    $this->em->flush();
                }

                $gp = new GrowthPlan($appraisal, $growthPlan->overallAssessment);
                $this->em->persist($gp);
                $this->em->flush();

                foreach ($growthPlan->strengths as $i => $s) {
                    if ($s->description === '') {
                        continue;
                    }
                    $this->em->persist(new StrengthWeakness($gp, StrengthWeaknessType::STRENGTH, $s->description, $i));
                }
                foreach ($growthPlan->weaknesses as $i => $w) {
                    if ($w->description === '') {
                        continue;
                    }
                    $this->em->persist(new StrengthWeakness($gp, StrengthWeaknessType::WEAKNESS, $w->description, $i));
                }

                foreach ($growthPlan->trainingNeeds as $i => $tn) {
                    if ($tn->description === '') {
                        continue;
                    }
                    $entity = new TrainingNeed($gp, TrainingNeedType::from($tn->type), $tn->description, TrainingNeedPriority::from($tn->priority), $i);
                    $entity->setCourseTitle($tn->courseTitle);
                    $entity->setInstitution($tn->institution);
                    $this->em->persist($entity);
                }

                foreach ($growthPlan->careerPlans as $cp) {
                    if ($cp->aspiredRole === '') {
                        continue;
                    }
                    $this->em->persist(new CareerPlan($gp, $cp->aspiredRole, $cp->priority));
                }

                foreach ($growthPlan->developmentNeeds as $dn) {
                    if ($dn->description === '') {
                        continue;
                    }
                    $this->em->persist(new DevelopmentNeed($gp, $dn->description, GrowthPlanPriority::from($dn->priority)));
                }

                $this->em->flush();

                $growthPlanImported = true;
                $strengthsCount = count($growthPlan->strengths);
                $weaknessesCount = count($growthPlan->weaknesses);
                $trainingNeedsCount = count($growthPlan->trainingNeeds);
            }

            // Fires AFTER all DB writes (KDs, ratings, comments, growth
            // plan) so new_state reflects the complete import.
            $this->auditService->log(
                'appraisal.excel_import',
                'Appraisal',
                $appraisal->getId(),
                $requestingUser,
                null,
                [
                    'kd_count' => $kdCount,
                    'competency_count' => $competencyCount,
                    'comments_imported' => $commentsImported,
                    'warnings' => $warnings,
                    'growth_plan_imported' => $growthPlanImported,
                    'strengths_count' => $strengthsCount,
                    'weaknesses_count' => $weaknessesCount,
                    'training_needs_count' => $trainingNeedsCount,
                ],
                null,
                [
                    'file_name' => $fileName ?? 'unknown.xls',
                    'kd_count' => $kdCount,
                    'competency_count' => $competencyCount,
                    'comments_imported' => $commentsImported,
                    'growth_plan_imported' => $growthPlanImported,
                    'strengths_count' => $strengthsCount,
                    'weaknesses_count' => $weaknessesCount,
                    'training_needs_count' => $trainingNeedsCount,
                ],
            );

            return ImportExcelOutcome::success(new ImportSummary(
                kdCount: $kdCount,
                competencyCount: $competencyCount,
                commentsImported: $commentsImported,
                warnings: $warnings,
                growthPlanImported: $growthPlanImported,
                strengthsCount: $strengthsCount,
                weaknessesCount: $weaknessesCount,
                trainingNeedsCount: $trainingNeedsCount,
            ));
        });
    }

    private function buildKdWeightWarning(string $kdWeightsSum): ?string
    {
        $diff = bcsub($kdWeightsSum, '1.0', 10);
        $absDiff = bccomp($diff, '0', 10) < 0 ? bcmul($diff, '-1', 10) : $diff;

        return bccomp($absDiff, self::WEIGHT_TOLERANCE, 10) > 0
            ? sprintf('KD weights sum to %s, not 1.0', $kdWeightsSum)
            : null;
    }
}
