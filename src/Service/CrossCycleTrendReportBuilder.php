<?php

declare(strict_types=1);

namespace App\Service;

use App\Repository\AppraisalRepository;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.reports.views.{CrossCycleTrendView, _build_trend_data_points}.
 * Unlike every other reports endpoint, this one is NOT scoped to a
 * single resolved cycle — it spans all CLOSED/ARCHIVED cycles at once.
 */
final class CrossCycleTrendReportBuilder
{
    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly ReportCalculations $calculations,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(?Uuid $departmentId): array
    {
        $rows = $this->appraisals->trendDataPointsByDepartment($departmentId);

        $dataPoints = array_map(fn (array $row) => [
            'cycle_id' => $row['cycleId'],
            'cycle_name' => $row['cycleName'],
            'cycle_year' => $row['cycleYear'],
            'avg_total_score' => $row['avgTotalScore'] !== null ? $this->calculations->roundHalfEven($row['avgTotalScore'], 2) : null,
            'appraisal_count' => $row['appraisalCount'],
        ], $rows);

        return [
            'department_id' => $departmentId !== null ? (string) $departmentId : null,
            'data_points' => $dataPoints,
        ];
    }
}
