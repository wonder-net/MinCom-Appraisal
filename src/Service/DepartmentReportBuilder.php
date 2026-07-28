<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\AppraisalCycle;
use App\Entity\Department;
use App\Repository\AppraisalRepository;

/**
 * Port of apps.reports.views.DepartmentReportView's aggregation logic +
 * apps.reports.services.build_department_report_payload.
 */
final class DepartmentReportBuilder
{
    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly ReportCalculations $calculations,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(Department $department, ?AppraisalCycle $cycle): array
    {
        if ($cycle === null) {
            $appraisalsByStatus = $this->calculations->zeroFilledStatusCounts([]);

            return [
                'department_id' => (string) $department->getId(),
                'department_name' => $department->getName(),
                'employee_count' => 0,
                'appraisals_by_status' => $appraisalsByStatus,
                'avg_total_score' => null,
                'completion_rate' => $this->calculations->completionRate($appraisalsByStatus),
            ];
        }

        $statusCounts = $this->appraisals->countStatusesByCycle($cycle, $department);
        $appraisalsByStatus = $this->calculations->zeroFilledStatusCounts($statusCounts);
        $employeeCount = $this->appraisals->countDistinctEmployeesByCycle($cycle, $department);

        $avgTotalScore = $this->appraisals->avgTotalScoreFinalisedByCycleAndDepartment($cycle, $department);

        return [
            'department_id' => (string) $department->getId(),
            'department_name' => $department->getName(),
            'employee_count' => $employeeCount,
            'appraisals_by_status' => $appraisalsByStatus,
            // _fetch_department_avg_total_score's quantize() omits
            // rounding=, so it's half-even, not half-up — see
            // ReportCalculations::roundHalfEven()'s docblock.
            'avg_total_score' => $avgTotalScore !== null ? $this->calculations->roundHalfEven($avgTotalScore, 2) : null,
            'completion_rate' => $this->calculations->completionRate($appraisalsByStatus),
        ];
    }
}
