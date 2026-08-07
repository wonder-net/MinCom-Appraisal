<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Appraisal;
use App\Entity\AppraisalCycle;
use App\Entity\CalibrationSession;
use App\Entity\Department;
use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Enum\CalibrationSessionStatus;
use App\Repository\AppraisalRepository;
use App\Repository\CalibrationSessionRepository;
use App\Repository\DepartmentRepository;
use App\Repository\EmployeeRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Calibration (product roadmap item — see CalibrationSession's
 * docblock for the full picture of what this gates and why).
 */
final class CalibrationService
{
    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly DepartmentRepository $departments,
        private readonly CalibrationSessionRepository $sessions,
        private readonly EmployeeRepository $employees,
        private readonly EntityManagerInterface $em,
    ) {
    }

    /**
     * The gate: does this appraisal's department have a COMPLETE
     * calibration session for its cycle? Checked from all three paths
     * that can move an appraisal to FINALISED — see CalibrationSession's
     * docblock.
     */
    public function isComplete(Appraisal $appraisal): bool
    {
        $session = $this->sessions->findOneByCycleAndDepartment(
            $appraisal->getCycle(),
            $appraisal->getEmployee()->getDepartment(),
        );

        return $session !== null && $session->getStatus() === CalibrationSessionStatus::COMPLETE;
    }

    /**
     * One row per department that has any SIGNED_OFF or FINALISED
     * appraisal in this cycle — departments with nothing calibration-
     * ready yet simply don't appear, there's nothing to review.
     *
     * @return list<array<string, mixed>>
     */
    public function overview(AppraisalCycle $cycle): array
    {
        $statusCounts = $this->appraisals->countStatusesByCycleGroupedByDepartment($cycle);

        $countsByDepartment = [];
        foreach ($statusCounts as $row) {
            $countsByDepartment[$row['departmentId']][$row['status']] = $row['count'];
        }

        $sessionsByDepartment = $this->sessions->findByCycleIndexedByDepartment($cycle);

        $rows = [];
        foreach ($countsByDepartment as $departmentId => $counts) {
            $signedOff = $counts[AppraisalStatus::SIGNED_OFF->value] ?? 0;
            $finalised = $counts[AppraisalStatus::FINALISED->value] ?? 0;
            if ($signedOff === 0 && $finalised === 0) {
                continue;
            }

            $department = $this->departments->find($departmentId);
            if ($department === null) {
                continue; // Defensive: shouldn't happen, department FK is non-nullable on Employee.
            }

            $session = $sessionsByDepartment[$departmentId] ?? null;

            $rows[] = [
                'department_id' => $departmentId,
                'department_name' => $department->getFullLabel(),
                'signed_off_count' => $signedOff,
                'finalised_count' => $finalised,
                'status' => ($session?->getStatus() ?? CalibrationSessionStatus::PENDING)->value,
                'completed_by_name' => $this->completedByName($session),
                'completed_at' => $session?->getCompletedAt()?->format(\DateTimeInterface::ATOM),
            ];
        }

        usort($rows, static fn (array $a, array $b) => $a['department_name'] <=> $b['department_name']);

        return $rows;
    }

    /**
     * @return array<string, mixed>
     */
    public function board(AppraisalCycle $cycle, Department $department): array
    {
        $appraisals = $this->appraisals->findSignedOffOrFinalisedByCycleAndDepartment($cycle, $department);
        $session = $this->sessions->findOneByCycleAndDepartment($cycle, $department);

        return [
            'cycle_id' => (string) $cycle->getId(),
            'department_id' => (string) $department->getId(),
            'department_name' => $department->getFullLabel(),
            'status' => ($session?->getStatus() ?? CalibrationSessionStatus::PENDING)->value,
            'completed_by_name' => $this->completedByName($session),
            'completed_at' => $session?->getCompletedAt()?->format(\DateTimeInterface::ATOM),
            'notes' => $session?->getNotes(),
            'appraisals' => array_map($this->buildRow(...), $appraisals),
        ];
    }

    public function complete(AppraisalCycle $cycle, Department $department, User $user, ?string $notes): CalibrationSession
    {
        $session = $this->sessions->findOneByCycleAndDepartment($cycle, $department);
        if ($session === null) {
            $session = new CalibrationSession($cycle, $department);
            $this->em->persist($session);
        }

        $session->markComplete($user, $notes);
        $this->em->flush();

        return $session;
    }

    /**
     * No-op if no session exists yet — absence is already equivalent to
     * PENDING, so there's nothing to reopen.
     */
    public function reopen(AppraisalCycle $cycle, Department $department): void
    {
        $session = $this->sessions->findOneByCycleAndDepartment($cycle, $department);
        if ($session === null) {
            return;
        }

        $session->reopen();
        $this->em->flush();
    }

    /**
     * Employee.name is the canonical display name when a profile
     * exists, not User.fullName — same fallback
     * UserAdminResourceFactory::fromEntity() uses, needed here because
     * admin-tier users (who complete calibration) may have no
     * User.fullName set at all while their linked Employee does.
     */
    private function completedByName(?CalibrationSession $session): ?string
    {
        $user = $session?->getCompletedBy();
        if ($user === null) {
            return null;
        }

        $employee = $this->employees->findByUser($user);

        return $employee !== null ? $employee->getName() : ($user->getFullName() ?? $user->getEmail());
    }

    /**
     * @return array<string, mixed>
     */
    private function buildRow(Appraisal $appraisal): array
    {
        $employee = $appraisal->getEmployee();
        $manager = $employee->getManager();

        return [
            'appraisal_id' => (string) $appraisal->getId(),
            'employee_id' => (string) $employee->getId(),
            'employee_number' => $employee->getEmployeeNumber(),
            'employee_name' => $employee->getName(),
            'manager_name' => $manager?->getName(),
            'status' => $appraisal->getStatus()->value,
            'kd_average_score' => $appraisal->getKdAverageScore(),
            'bc_average_score' => $appraisal->getBcAverageScore(),
            'total_score' => $appraisal->getTotalScore(),
            'performance_descriptor' => $appraisal->getPerformanceDescriptor(),
        ];
    }
}
