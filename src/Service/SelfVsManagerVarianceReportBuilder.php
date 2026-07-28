<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\AppraisalCycle;
use App\Entity\Department;
use App\Repository\CompetencyRatingRepository;
use App\Repository\KeyDeliverableRepository;

/**
 * Port of apps.reports.views.SelfVsManagerVarianceView + its
 * _build_kd_variance_rows/_build_competency_variance_rows/_compute_variance
 * helpers.
 */
final class SelfVsManagerVarianceReportBuilder
{
    public function __construct(
        private readonly KeyDeliverableRepository $keyDeliverables,
        private readonly CompetencyRatingRepository $competencyRatings,
        private readonly ReportCalculations $calculations,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(AppraisalCycle $cycle, ?Department $department): array
    {
        if (!$cycle->isSelfRatingEnabled()) {
            return [
                'cycle_id' => (string) $cycle->getId(),
                'self_rating_enabled' => false,
                'kd_variances' => [],
                'competency_variances' => [],
            ];
        }

        $kdRows = $this->keyDeliverables->avgSelfAndManagerRatingByPerspectiveForFinalised($cycle, $department);
        $kdVariances = $this->sortByVarianceDesc(array_map(fn (array $row) => [
            'kd_title' => $row['kdTitle'],
            ...$this->buildRatingFields($row['avgSelf'], $row['avgManager']),
            'count' => $row['count'],
        ], $kdRows));

        $competencyRows = $this->competencyRatings->avgSelfAndManagerRatingByCompetencyForFinalised($cycle, $department);
        $competencyVariances = $this->sortByVarianceDesc(array_map(fn (array $row) => [
            'competency_name' => $row['competencyName'],
            'is_core' => $row['isCore'],
            ...$this->buildRatingFields($row['avgSelf'], $row['avgManager']),
            'count' => $row['count'],
        ], $competencyRows));

        return [
            'cycle_id' => (string) $cycle->getId(),
            'self_rating_enabled' => true,
            'kd_variances' => $kdVariances,
            'competency_variances' => $competencyVariances,
        ];
    }

    /**
     * @return array{avg_self_rating: string, avg_manager_rating: string, variance: string}
     */
    private function buildRatingFields(string $avgSelf, string $avgManager): array
    {
        $avgSelfRounded = $this->calculations->roundHalfEven($avgSelf, 2);
        $avgManagerRounded = $this->calculations->roundHalfEven($avgManager, 2);

        return [
            'avg_self_rating' => $avgSelfRounded,
            'avg_manager_rating' => $avgManagerRounded,
            'variance' => bcsub($avgSelfRounded, $avgManagerRounded, 2),
        ];
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return list<array<string, mixed>>
     */
    private function sortByVarianceDesc(array $rows): array
    {
        usort($rows, static fn (array $a, array $b) => bccomp($b['variance'], $a['variance'], 2));

        return $rows;
    }
}
