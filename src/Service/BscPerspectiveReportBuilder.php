<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\AppraisalCycle;
use App\Entity\Department;
use App\Repository\KeyDeliverableRepository;

/**
 * Port of apps.reports.views.BSCPerspectiveBreakdownView._build_payload.
 */
final class BscPerspectiveReportBuilder
{
    public function __construct(
        private readonly KeyDeliverableRepository $keyDeliverables,
        private readonly ReportCalculations $calculations,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(AppraisalCycle $cycle, ?Department $department): array
    {
        $rows = $this->keyDeliverables->avgWeightedScoreByPerspectiveForFinalised($cycle, $department);

        $perspectives = array_map(fn (array $row) => [
            'perspective_id' => $row['perspectiveId'],
            'perspective_name' => $row['perspectiveName'],
            'avg_weighted_score' => $this->calculations->roundHalfEven($row['avgWeightedScore'], 4),
            'appraisal_count' => $row['appraisalCount'],
        ], $rows);

        return [
            'cycle_id' => (string) $cycle->getId(),
            'perspectives' => $perspectives,
        ];
    }
}
