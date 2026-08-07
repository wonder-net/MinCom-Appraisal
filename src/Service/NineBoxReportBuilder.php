<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Appraisal;
use App\Entity\AppraisalCycle;
use App\Repository\AppraisalRepository;
use App\Repository\GrowthPlanRepository;

/**
 * 9-box talent grid (product roadmap item, not one of the 11 original
 * HR change requests — see the "9-box first" roadmap conversation).
 *
 * Performance (one axis) needed no new field: it's derived from the
 * appraisal's existing 0-100 total_score, collapsed from the 5
 * Balanced Scorecard bands (Outstanding/Good/Moderate/Average/Under —
 * see ScoreEngine/score_descriptor) down to the 3 a 9-box grid needs:
 *   - HIGH:   total_score >= 70 (Good Performer and above)
 *   - MEDIUM: 50 <= total_score < 70 (Average + Moderate Performer)
 *   - LOW:    total_score < 50 (Under Performer)
 * Fixed numeric thresholds, not a lookup against score_descriptor rows
 * directly — cycles may have custom per-cycle descriptor labels/bands
 * (ConfigSnapshotBuilder), and this grid's 3-tier shape shouldn't
 * silently break if a cycle's custom bands don't map cleanly onto it.
 *
 * Potential (the other axis) is GrowthPlan.potentialRating, set by the
 * manager during GROWTH_PLANNING — see PotentialRating's docblock.
 * Employees whose growth plan never got a potential rating are excluded
 * from the grid itself (there's no meaningful cell to place them in)
 * but still surfaced in `unrated_employees` so HR can see who's missing
 * one, rather than that gap being silently invisible.
 *
 * Only FINALISED appraisals are considered, matching every other
 * analytics report in this codebase (ScoreDistributionReportBuilder
 * etc.) — a 9-box grid built from still-in-progress ratings would be
 * actively misleading for succession planning.
 */
final class NineBoxReportBuilder
{
    private const PERFORMANCE_TIERS = ['LOW', 'MEDIUM', 'HIGH'];
    private const POTENTIAL_TIERS = ['LOW', 'MEDIUM', 'HIGH'];

    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly GrowthPlanRepository $growthPlans,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(AppraisalCycle $cycle): array
    {
        $appraisals = $this->appraisals->findFinalisedByCycleOrderedByEmployeeNumber($cycle);
        $growthPlansByAppraisalId = $this->growthPlans->findByAppraisalsIndexed($appraisals);

        $cells = $this->emptyCells();
        $unratedEmployees = [];

        foreach ($appraisals as $appraisal) {
            \assert($appraisal instanceof Appraisal);
            $totalScore = $appraisal->getTotalScore();
            if ($totalScore === null) {
                continue; // Defensive: FINALISED should always have a score, but never plot a blank one.
            }

            $growthPlan = $growthPlansByAppraisalId[(string) $appraisal->getId()] ?? null;
            $potential = $growthPlan?->getPotentialRating();

            $employeeRow = $this->buildEmployeeRow($appraisal, $totalScore);

            if ($potential === null) {
                $unratedEmployees[] = $employeeRow;
                continue;
            }

            $performanceTier = $this->performanceTier($totalScore);
            $cellKey = $performanceTier.'|'.$potential->value;
            $cells[$cellKey]['count']++;
            $cells[$cellKey]['employees'][] = $employeeRow;
        }

        return [
            'cycle_id' => (string) $cycle->getId(),
            'total_finalised' => count($appraisals),
            'rated_count' => count($appraisals) - count($unratedEmployees),
            'unrated_count' => count($unratedEmployees),
            'unrated_employees' => $unratedEmployees,
            'grid' => array_values($cells),
        ];
    }

    /**
     * @return array<string, array{performance: string, potential: string, count: int, employees: list<array<string, mixed>>}>
     */
    private function emptyCells(): array
    {
        $cells = [];
        // Deterministic order: potential ascending within each
        // performance row, performance ascending overall — LOW/LOW
        // first, HIGH/HIGH last, matching how a 9-box grid reads
        // bottom-left to top-right.
        foreach (self::PERFORMANCE_TIERS as $performance) {
            foreach (self::POTENTIAL_TIERS as $potential) {
                $cells[$performance.'|'.$potential] = [
                    'performance' => $performance,
                    'potential' => $potential,
                    'count' => 0,
                    'employees' => [],
                ];
            }
        }

        return $cells;
    }

    private function performanceTier(string $totalScore): string
    {
        if (bccomp($totalScore, '70', 2) >= 0) {
            return 'HIGH';
        }
        if (bccomp($totalScore, '50', 2) >= 0) {
            return 'MEDIUM';
        }

        return 'LOW';
    }

    /**
     * @return array<string, mixed>
     */
    private function buildEmployeeRow(Appraisal $appraisal, string $totalScore): array
    {
        $employee = $appraisal->getEmployee();

        return [
            'appraisal_id' => (string) $appraisal->getId(),
            'employee_id' => (string) $employee->getId(),
            'employee_number' => $employee->getEmployeeNumber(),
            'employee_name' => $employee->getName(),
            'department_name' => $employee->getDepartment()->getName(),
            'total_score' => $totalScore,
            'performance_descriptor' => $appraisal->getPerformanceDescriptor(),
        ];
    }
}
