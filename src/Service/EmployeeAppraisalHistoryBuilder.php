<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Appraisal;
use App\Entity\Employee;
use App\Repository\AppraisalRepository;

/**
 * Port of apps.reports.views.{EmployeeAppraisalHistoryView, _build_history_rows}.
 * Uncached, matching Django (no cache.get/set in this view).
 */
final class EmployeeAppraisalHistoryBuilder
{
    public function __construct(private readonly AppraisalRepository $appraisals)
    {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(Employee $employee): array
    {
        $appraisals = $this->appraisals->findByEmployeeOrderedByCycleStartDate($employee);

        return [
            'employee_id' => (string) $employee->getId(),
            'employee_name' => $employee->getName(),
            'history' => array_map(fn (Appraisal $appraisal) => $this->buildRow($appraisal), $appraisals),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function buildRow(Appraisal $appraisal): array
    {
        $cycle = $appraisal->getCycle();

        return [
            'cycle_id' => (string) $cycle->getId(),
            'cycle_name' => $cycle->getPeriodName(),
            'cycle_year' => (int) $cycle->getStartDate()->format('Y'),
            'cycle_status' => $cycle->getStatus()->value,
            'total_score' => $appraisal->getTotalScore(),
            'kd_average_score' => $appraisal->getKdAverageScore(),
            'bc_average_score' => $appraisal->getBcAverageScore(),
            'performance_descriptor' => $appraisal->getPerformanceDescriptor(),
            'kd_descriptor' => $appraisal->getKdDescriptor(),
            'bc_descriptor' => $appraisal->getBcDescriptor(),
            'appraisal_status' => $appraisal->getStatus()->value,
            'appraisal_id' => (string) $appraisal->getId(),
        ];
    }
}
