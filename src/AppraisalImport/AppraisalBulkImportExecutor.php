<?php

declare(strict_types=1);

namespace App\AppraisalImport;

use App\Entity\Appraisal;
use App\Entity\CareerPlan;
use App\Entity\Comment;
use App\Entity\CompetencyRating;
use App\Entity\DevelopmentNeed;
use App\Entity\GrowthPlan;
use App\Entity\KeyDeliverable;
use App\Entity\Signature;
use App\Entity\StrengthWeakness;
use App\Entity\TrainingNeed;
use App\Entity\User;
use App\Enum\AppraisalFormType;
use App\Enum\AppraisalPartyRole;
use App\Enum\AppraisalStatus;
use App\Enum\GrowthPlanPriority;
use App\Enum\SignatureAction;
use App\Enum\StrengthWeaknessType;
use App\Enum\TrainingNeedPriority;
use App\Enum\TrainingNeedType;
use App\Repository\AppraisalCycleRepository;
use App\Repository\AppraisalRepository;
use App\Repository\BscPerspectiveRepository;
use App\Repository\CommentRepository;
use App\Repository\CompetencyRatingRepository;
use App\Repository\CompetencyRepository;
use App\Repository\EmployeeRepository;
use App\Repository\GrowthPlanRepository;
use App\Repository\KeyDeliverableRepository;
use App\Repository\SignatureRepository;
use App\Service\ScoreEngine;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Uid\Uuid;

/**
 * Port of appraisal_bulk_import_service.AppraisalBulkImportExecutor
 * (Step 2: the write path). Imports one parsed file into one
 * employee's appraisal, bypassing the workflow state machine (matches
 * Django: status is set directly, not via WorkflowService::doTransition()).
 *
 * Audit logging (audit_log_action("appraisal.bulk_imported", ...)) is
 * intentionally omitted — the `audit` app isn't ported yet.
 */
final class AppraisalBulkImportExecutor
{
    /**
     * @var list<string>
     */
    private const GROWTH_PLAN_STATUSES = [
        AppraisalStatus::GROWTH_PLANNING->value,
        AppraisalStatus::PENDING_SIGNOFF->value,
        AppraisalStatus::SIGNED_OFF->value,
        AppraisalStatus::FINALISED->value,
    ];

    public function __construct(
        private readonly EmployeeRepository $employees,
        private readonly AppraisalCycleRepository $cycles,
        private readonly AppraisalRepository $appraisals,
        private readonly BscPerspectiveRepository $perspectives,
        private readonly KeyDeliverableRepository $keyDeliverables,
        private readonly CompetencyRepository $competencies,
        private readonly CompetencyRatingRepository $competencyRatings,
        private readonly CommentRepository $comments,
        private readonly SignatureRepository $signatures,
        private readonly GrowthPlanRepository $growthPlans,
        private readonly FuzzyMatcher $fuzzyMatcher,
        private readonly ScoreEngine $scoreEngine,
        private readonly EntityManagerInterface $em,
    ) {
    }

    public function executeSingle(
        ParsedAppraisalSheet $parsedSheet,
        ?ParsedGrowthPlan $parsedGrowthPlan,
        string $employeeId,
        string $targetStatus,
        User $requestingUser,
        ?string $cycleId,
    ): ExecutorResult {
        $employee = Uuid::isValid($employeeId) ? $this->employees->find(Uuid::fromString($employeeId)) : null;
        if ($employee === null) {
            return ExecutorResult::failure('Employee not found.');
        }

        if ($cycleId !== null) {
            $cycle = Uuid::isValid($cycleId) ? $this->cycles->find(Uuid::fromString($cycleId)) : null;
            if ($cycle === null) {
                return ExecutorResult::failure('Specified appraisal cycle not found.');
            }
        } else {
            $cycle = $this->cycles->findOneActive();
            if ($cycle === null) {
                return ExecutorResult::failure('No active appraisal cycle found.');
            }
        }

        return $this->em->wrapInTransaction(function () use ($parsedSheet, $parsedGrowthPlan, $employee, $targetStatus, $requestingUser, $cycle): ExecutorResult {
            $appraisal = $this->appraisals->findOneByCycleAndEmployee($cycle, $employee);
            $created = $appraisal === null;
            if ($appraisal === null) {
                $appraisal = new Appraisal($cycle, $employee, AppraisalFormType::from($parsedSheet->formType), AppraisalStatus::SELF_ASSESSMENT);
                $this->em->persist($appraisal);
                $this->em->flush();
            }

            // 1. Import KDs — delete existing, create new.
            foreach ($this->keyDeliverables->findAllByAppraisal($appraisal) as $existingKd) {
                $this->em->remove($existingKd);
            }
            $this->em->flush();

            $perspectivesByName = [];
            foreach ($this->perspectives->findAllOrderedBySortOrder() as $perspective) {
                $perspectivesByName[strtolower($perspective->getName())] = $perspective;
            }

            $kdCount = 0;
            foreach ($parsedSheet->keyDeliverables as $kd) {
                if ($kd->description === '') {
                    continue;
                }
                $perspective = $perspectivesByName[strtolower($kd->perspectiveName)] ?? null;
                if ($perspective === null) {
                    continue;
                }

                $entity = new KeyDeliverable($appraisal, $perspective, $kd->description, $kd->weight);
                $entity->setSortOrder($kd->sortOrder);
                $entity->setManagerRating($kd->managerRating);
                $entity->setSelfRating($kd->managerRating); // Single agreed rating, matching Django.
                $this->em->persist($entity);
                ++$kdCount;
            }
            $this->em->flush();

            // 2. Import competency ratings — update existing (from cycle
            // activation) or create new (appraisal just created by import).
            // Matches Django's Competency.objects.values("id", "name") here,
            // which — unlike most other competency reads — does not filter
            // by is_active, so an inactive competency can still be matched
            // against during bulk import.
            $systemCompetencies = [];
            $competenciesById = [];
            foreach ($this->competencies->findAllOrderedBySortOrder(true) as $competency) {
                $systemCompetencies[] = ['id' => (string) $competency->getId(), 'name' => $competency->getName()];
                $competenciesById[(string) $competency->getId()] = $competency;
            }

            foreach ($parsedSheet->competencyRatings as $cr) {
                if ($cr->competencyName === '') {
                    continue;
                }
                $matched = $this->fuzzyMatcher->matchCompetencyName($cr->competencyName, $systemCompetencies);
                if ($matched === null) {
                    continue;
                }
                $competency = $competenciesById[$matched['id']];

                $rating = $this->competencyRatings->findOneByAppraisalAndCompetency($appraisal, $competency);
                if ($rating === null) {
                    $rating = new CompetencyRating($appraisal, $competency);
                    $this->em->persist($rating);
                }
                $rating->setManagerRating($cr->managerRating);
                $rating->setSelfRating($cr->managerRating);
            }
            $this->em->flush();

            // 3. Resolve appraiser user — needed for comments and signatures.
            $appraiserUserResolved = null;
            if ($employee->getManager() !== null) {
                $appraiserUserResolved = $employee->getManager()->getUser();
            } elseif ($parsedGrowthPlan !== null && $parsedGrowthPlan->appraiserSignName !== '') {
                $targetName = strtolower(trim($parsedGrowthPlan->appraiserSignName));
                foreach ($this->employees->findAllActive() as $candidate) {
                    if (strtolower(trim($candidate->getName())) === $targetName) {
                        $appraiserUserResolved = $candidate->getUser();
                        break;
                    }
                }
            }

            // 4. Import comments — delete ALL existing comments before
            // re-import. Bulk import replaces the entire appraisal
            // content; any manually entered comments from the UI are
            // superseded by the spreadsheet data.
            foreach ($this->comments->findByAppraisalOrdered($appraisal) as $existingComment) {
                $this->em->remove($existingComment);
            }
            $this->em->flush();

            foreach ($parsedSheet->comments as $comment) {
                if (trim($comment->content) === '') {
                    continue;
                }
                if ($comment->authorRole === 'APPRAISEE') {
                    $author = $employee->getUser();
                } elseif ($comment->authorRole === 'APPRAISER' && $appraiserUserResolved !== null) {
                    $author = $appraiserUserResolved;
                } else {
                    $author = $requestingUser;
                }
                $this->em->persist(new Comment($appraisal, $author, AppraisalPartyRole::from($comment->authorRole), $comment->content));
            }
            $this->em->flush();

            // 4b. Import growth plan (if present and target status >= GROWTH_PLANNING).
            if ($parsedGrowthPlan !== null && in_array($targetStatus, self::GROWTH_PLAN_STATUSES, true)) {
                $this->importGrowthPlan($appraisal, $parsedGrowthPlan);
            }

            // 5. Compute scores.
            $this->scoreEngine->computeScores($appraisal);

            // 6. Create signatures if target status >= SIGNED_OFF. Bulk
            // import bypasses WorkflowService::doTransition() so we must
            // set signingRound ourselves: pinning both the appraisal and
            // its signatures to round 1 keeps the round-scoped uniqueness
            // constraint satisfied.
            $signedOffStatuses = [AppraisalStatus::SIGNED_OFF->value, AppraisalStatus::FINALISED->value];
            $importedRound = 1;
            if (in_array($targetStatus, $signedOffStatuses, true)) {
                $importedHash = hash('sha256', 'imported');

                $appraiseeDate = $parsedGrowthPlan !== null ? $this->parseSignDate($parsedGrowthPlan->appraiseeSignDate) : null;
                $appraiserDate = $parsedGrowthPlan !== null ? $this->parseSignDate($parsedGrowthPlan->appraiserSignDate) : null;

                $now = new \DateTimeImmutable();

                $this->upsertSignature($appraisal, $employee->getUser(), AppraisalPartyRole::APPRAISEE, $importedRound, $appraiseeDate ?? $now, $importedHash);

                if ($appraiserUserResolved !== null) {
                    $this->upsertSignature($appraisal, $appraiserUserResolved, AppraisalPartyRole::APPRAISER, $importedRound, $appraiserDate ?? $now, $importedHash);
                }
                $this->em->flush();
            }

            // 7. Set target status (skip workflow transitions). Stamp
            // signingRound=1 whenever the target lands at or past
            // PENDING_SIGNOFF.
            $pendingOrAfter = [
                AppraisalStatus::PENDING_SIGNOFF->value,
                AppraisalStatus::SIGNED_OFF->value,
                AppraisalStatus::FINALISED->value,
                AppraisalStatus::DISPUTED->value,
            ];
            $appraisal->setStatus(AppraisalStatus::from($targetStatus));
            if (in_array($targetStatus, $pendingOrAfter, true) && $appraisal->getSigningRound() < 1) {
                $appraisal->setSigningRound($importedRound);
            }
            $this->em->flush();

            return ExecutorResult::success((string) $appraisal->getId(), $kdCount, $created);
        });
    }

    /**
     * Port of the growth-plan-import block in execute_single: delete
     * any existing GrowthPlan (cascades to children) and recreate from
     * the parsed sheet.
     */
    private function importGrowthPlan(Appraisal $appraisal, ParsedGrowthPlan $parsedGrowthPlan): void
    {
        $existing = $this->growthPlans->findOneByAppraisal($appraisal);
        if ($existing !== null) {
            $this->em->remove($existing);
            $this->em->flush();
        }

        $growthPlan = new GrowthPlan($appraisal, $parsedGrowthPlan->overallAssessment);
        $this->em->persist($growthPlan);
        $this->em->flush();

        foreach ($parsedGrowthPlan->strengths as $s) {
            if ($s->description === '') {
                continue;
            }
            $this->em->persist(new StrengthWeakness($growthPlan, StrengthWeaknessType::STRENGTH, $s->description));
        }
        foreach ($parsedGrowthPlan->weaknesses as $w) {
            if ($w->description === '') {
                continue;
            }
            $this->em->persist(new StrengthWeakness($growthPlan, StrengthWeaknessType::WEAKNESS, $w->description));
        }

        foreach ($parsedGrowthPlan->trainingNeeds as $tn) {
            if ($tn->description === '') {
                continue;
            }
            $entity = new TrainingNeed(
                $growthPlan,
                TrainingNeedType::from($tn->type),
                $tn->description,
                TrainingNeedPriority::from($tn->priority),
            );
            $entity->setCourseTitle($tn->courseTitle);
            $entity->setInstitution($tn->institution);
            $this->em->persist($entity);
        }

        foreach ($parsedGrowthPlan->careerPlans as $cp) {
            if ($cp->aspiredRole === '') {
                continue;
            }
            $this->em->persist(new CareerPlan($growthPlan, $cp->aspiredRole, $cp->priority));
        }

        foreach ($parsedGrowthPlan->developmentNeeds as $dn) {
            if ($dn->description === '') {
                continue;
            }
            $this->em->persist(new DevelopmentNeed($growthPlan, $dn->description, GrowthPlanPriority::from($dn->priority)));
        }

        $this->em->flush();
    }

    /**
     * Overwrites a prior round-1 signature (e.g. a REJECT from an
     * earlier import attempt) — Signature has no setters for
     * signerRole/action/signedAt (append-only by design elsewhere), so
     * "update_or_create" here means remove-then-recreate.
     */
    private function upsertSignature(Appraisal $appraisal, User $signer, AppraisalPartyRole $role, int $round, \DateTimeImmutable $signedAt, string $userAgentHash): void
    {
        $existing = $this->signatures->findOneByAppraisalSignerAndRound($appraisal, $signer, $round);
        if ($existing !== null) {
            $this->em->remove($existing);
            $this->em->flush();
        }

        $signature = new Signature($appraisal, $signer, $role, SignatureAction::ACCEPT, $signedAt, 'imported', $userAgentHash, $round);
        $signature->setDiscussed(true);
        $this->em->persist($signature);
    }

    private function parseSignDate(string $dateStr): ?\DateTimeImmutable
    {
        $dateStr = trim($dateStr);
        if ($dateStr === '') {
            return null;
        }

        foreach (['Y-m-d', 'd/m/Y', 'm/d/Y', 'd-m-Y'] as $format) {
            $date = \DateTimeImmutable::createFromFormat('!'.$format, $dateStr);
            if ($date !== false) {
                return $date;
            }
        }

        return null;
    }
}
