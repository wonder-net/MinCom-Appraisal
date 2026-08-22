<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Appraisal;
use App\Entity\AppraisalCycle;
use App\Entity\Competency;
use App\Entity\CompetencyRating;
use App\Entity\Employee;
use App\Entity\SubCompetency;
use App\Entity\SubCompetencyRating;
use App\Enum\AppraisalFormType;
use App\Enum\AppraisalStatus;
use App\Enum\CompetencyApplicableTo;
use App\Enum\EmployeeClassification;
use App\Repository\CompetencyRepository;
use App\Repository\EmployeeRepository;
use App\Repository\SubCompetencyRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Port of apps.appraisals.services.create_appraisals_for_cycle /
 * build_appraisal_instances / build_competency_ratings: bulk-creates one
 * Appraisal + applicable CompetencyRating rows per active,
 * non-executive employee when a cycle is activated.
 */
final class AppraisalInstanceBuilder
{
    public function __construct(
        private readonly EmployeeRepository $employees,
        private readonly CompetencyRepository $competencies,
        private readonly SubCompetencyRepository $subCompetencies,
        private readonly SubCompetencyWeightCalculator $weightCalculator,
        private readonly EntityManagerInterface $em,
    ) {
    }

    /**
     * @return array{appraisals: list<Appraisal>, ratings: list<CompetencyRating>}
     */
    public function createForCycle(AppraisalCycle $cycle): array
    {
        $activeEmployees = $this->employees->findActiveExcludingExecutives();
        if ($activeEmployees === []) {
            return ['appraisals' => [], 'ratings' => []];
        }

        // Active competencies only — deliberately different from
        // ConfigSnapshotBuilder, which freezes ALL (active + inactive)
        // competencies for the audit snapshot. Soft-deactivated
        // competencies must not seed new rating rows (TASK-286).
        $competenciesByApplicable = [];
        $allCompetencies = $this->competencies->findAllOrderedBySortOrder(includeInactive: false);
        foreach ($allCompetencies as $competency) {
            $competenciesByApplicable[$competency->getApplicableTo()->value][] = $competency;
        }

        // Pre-fetch active sub-competencies once (same active-only,
        // loop-invariant fetch pattern as $competenciesByApplicable
        // above), keyed by parent competency id, so each employee's
        // CompetencyRating creation below doesn't re-query per row.
        $subCompetenciesByCompetencyId = [];
        foreach ($allCompetencies as $competency) {
            $subs = $this->subCompetencies->findByCompetencyOrdered($competency);
            if ($subs !== []) {
                $subCompetenciesByCompetencyId[(string) $competency->getId()] = $subs;
            }
        }

        $initialStatus = $cycle->isSelfRatingEnabled() ? AppraisalStatus::SELF_ASSESSMENT : AppraisalStatus::MANAGER_REVIEW;

        $appraisals = [];
        $ratings = [];

        foreach ($activeEmployees as $employee) {
            $formType = $this->deriveFormType($employee);
            $appraisal = new Appraisal($cycle, $employee, $formType, $initialStatus);
            $this->em->persist($appraisal);
            $appraisals[] = $appraisal;

            foreach ($this->applicableFilters($formType) as $filterValue) {
                foreach ($competenciesByApplicable[$filterValue] ?? [] as $competency) {
                    $rating = new CompetencyRating($appraisal, $competency);
                    $this->em->persist($rating);
                    $ratings[] = $rating;

                    $this->seedSubCompetencyRatings($rating, $competency, $subCompetenciesByCompetencyId);
                }
            }
        }

        $this->em->flush();

        return ['appraisals' => $appraisals, 'ratings' => $ratings];
    }

    /**
     * @param array<string, list<SubCompetency>> $subCompetenciesByCompetencyId
     */
    private function seedSubCompetencyRatings(CompetencyRating $rating, Competency $competency, array $subCompetenciesByCompetencyId): void
    {
        $subCompetencies = $subCompetenciesByCompetencyId[(string) $competency->getId()] ?? [];
        if ($subCompetencies === []) {
            return;
        }

        $shares = $this->weightCalculator->computeShares(count($subCompetencies));
        foreach ($subCompetencies as $index => $subCompetency) {
            $this->em->persist(new SubCompetencyRating($rating, $subCompetency, $subCompetency->getName(), $subCompetency->getSortOrder(), $shares[$index]));
        }
    }

    private function deriveFormType(Employee $employee): AppraisalFormType
    {
        return $employee->getClassification() === EmployeeClassification::MANAGERIAL
            ? AppraisalFormType::FORM_A
            : AppraisalFormType::FORM_B;
    }

    /**
     * @return list<string>
     */
    private function applicableFilters(AppraisalFormType $formType): array
    {
        return $formType === AppraisalFormType::FORM_A
            ? [CompetencyApplicableTo::ALL->value, CompetencyApplicableTo::MANAGERIAL->value]
            : [CompetencyApplicableTo::ALL->value, CompetencyApplicableTo::NON_MANAGERIAL->value];
    }
}
