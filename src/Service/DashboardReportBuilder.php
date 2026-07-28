<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\AppraisalCycle;
use App\Enum\AppraisalStatus;
use App\Repository\AppraisalRepository;
use App\Repository\DepartmentRepository;

/**
 * Port of apps.reports.views.DashboardReportView's aggregation logic +
 * apps.reports.services.build_dashboard_payload.
 */
final class DashboardReportBuilder
{
    /**
     * Appraisals stuck in one of these non-terminal statuses for >14
     * days count as overdue — aligned with notifications'
     * _NON_TERMINAL_STATUSES (send_overdue_reminders), not yet ported.
     *
     * @var list<AppraisalStatus>
     */
    private const OVERDUE_STATUSES = [
        AppraisalStatus::SELF_ASSESSMENT,
        AppraisalStatus::MANAGER_REVIEW,
        AppraisalStatus::DISCUSSION,
        AppraisalStatus::GROWTH_PLANNING,
        AppraisalStatus::PENDING_SIGNOFF,
    ];

    private const OVERDUE_DAYS = 14;

    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly DepartmentRepository $departments,
        private readonly ReportCalculations $calculations,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(?AppraisalCycle $cycle): array
    {
        if ($cycle === null) {
            return [
                'cycle_id' => null,
                'cycle_name' => null,
                'total_employees' => 0,
                'completion_rate' => '0.00',
                'overdue_count' => 0,
                'appraisals_by_status' => $this->calculations->zeroFilledStatusCounts([]),
                'departments' => [],
            ];
        }

        $statusCounts = $this->appraisals->countStatusesByCycle($cycle);
        $appraisalsByStatus = $this->calculations->zeroFilledStatusCounts($statusCounts);
        $totalEmployees = $this->appraisals->countDistinctEmployeesByCycle($cycle);

        $cutoff = new \DateTimeImmutable(sprintf('-%d days', self::OVERDUE_DAYS));
        $overdueCount = $this->appraisals->countOverdueByCycle($cycle, self::OVERDUE_STATUSES, $cutoff);

        return [
            'cycle_id' => (string) $cycle->getId(),
            'cycle_name' => $cycle->getPeriodName(),
            'total_employees' => $totalEmployees,
            'completion_rate' => $this->calculations->completionRate($appraisalsByStatus),
            'overdue_count' => $overdueCount,
            'appraisals_by_status' => $appraisalsByStatus,
            'departments' => $this->buildDepartmentSummaries($cycle),
        ];
    }

    /**
     * @return list<array{department_id: string, department_name: string, employee_count: int, completion_rate: string}>
     */
    private function buildDepartmentSummaries(AppraisalCycle $cycle): array
    {
        $statusRows = $this->appraisals->countStatusesByCycleGroupedByDepartment($cycle);
        $employeeCounts = $this->appraisals->countDistinctEmployeesByCycleGroupedByDepartment($cycle);

        $deptStatusCounts = [];
        foreach ($statusRows as $row) {
            $deptStatusCounts[$row['departmentId']][$row['status']] = $row['count'];
        }

        if ($deptStatusCounts === []) {
            return [];
        }

        $departments = $this->departments->findBy(['id' => array_keys($deptStatusCounts)]);
        $departmentNames = [];
        foreach ($departments as $department) {
            $departmentNames[(string) $department->getId()] = $department->getName();
        }

        $summaries = [];
        foreach ($deptStatusCounts as $departmentId => $statusCounts) {
            $appraisalsByStatus = $this->calculations->zeroFilledStatusCounts($statusCounts);
            $summaries[] = [
                'department_id' => $departmentId,
                'department_name' => $departmentNames[$departmentId] ?? '',
                'employee_count' => $employeeCounts[$departmentId] ?? 0,
                'completion_rate' => $this->calculations->completionRate($appraisalsByStatus),
            ];
        }

        usort($summaries, static fn (array $a, array $b) => $a['department_name'] <=> $b['department_name']);

        return $summaries;
    }
}
