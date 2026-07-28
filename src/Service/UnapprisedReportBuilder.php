<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\AppraisalCycle;
use App\Entity\Department;
use App\Entity\Employee;
use App\Repository\EmployeeRepository;

/**
 * Port of apps.reports.views.{UnapraisedReportView._build_payload,
 * _build_unapprised_employee_row}.
 */
final class UnapprisedReportBuilder
{
    public function __construct(private readonly EmployeeRepository $employees)
    {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(AppraisalCycle $cycle, ?Department $department): array
    {
        $employees = $this->employees->findUnapprisedForCycle($cycle, $department);
        $rows = array_map(fn (Employee $employee) => $this->buildRow($employee), $employees);

        return [
            'cycle_id' => (string) $cycle->getId(),
            'count' => count($rows),
            'employees' => $rows,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function buildRow(Employee $employee): array
    {
        return [
            'employee_id' => (string) $employee->getId(),
            'employee_number' => $employee->getEmployeeNumber(),
            'name' => $employee->getName(),
            'job_title' => $employee->getJobTitle(),
            'department_name' => $employee->getDepartment()->getName(),
            'manager_name' => $employee->getManager()?->getName() ?? '',
        ];
    }
}
