<?php

declare(strict_types=1);

namespace App\Controller\Reports;

use App\Entity\Employee;
use App\Entity\User;
use App\Enum\RoleName;
use App\Repository\EmployeeRepository;
use App\Service\EmployeeAppraisalHistoryBuilder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of EmployeeAppraisalHistoryView + _resolve_employee_access.
 * Any authenticated user may call this (permission check is entirely
 * object-level, done here): admin tier sees any employee; MANAGER sees
 * only their own direct reports; everyone else sees only their own
 * record. Notably, HR_OFFICER/EXECUTIVE get NO special access here
 * (Django's permission_classes = [IsAuthenticated] only) — they fall
 * through to the self/manager checks like anyone else. Uncached,
 * matching Django (no cache.get/set in this view).
 */
final class EmployeeAppraisalHistoryController
{
    public function __construct(
        private readonly EmployeeRepository $employees,
        private readonly EmployeeAppraisalHistoryBuilder $builder,
    ) {
    }

    #[Route('/api/v1/reports/employees/{employeeId}/appraisal-history/', name: 'reports_employee_appraisal_history', methods: ['GET'], requirements: ['employeeId' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $employeeId, #[CurrentUser] User $user): JsonResponse
    {
        $employee = $this->employees->findActiveById($employeeId);
        if ($employee === null) {
            throw new NotFoundHttpException();
        }

        if (!$this->checkAccess($user, $employee)) {
            return new JsonResponse(['detail' => "You do not have permission to view this employee's history."], 403);
        }

        return new JsonResponse($this->builder->build($employee));
    }

    private function checkAccess(User $user, Employee $employee): bool
    {
        if ($user->hasAdminRole()) {
            return true;
        }

        $requesterProfile = $this->employees->findByUser($user);
        if ($requesterProfile === null) {
            return false;
        }

        if ($user->hasRole(RoleName::MANAGER) && $employee->getManager()?->getId()->equals($requesterProfile->getId())) {
            return true;
        }

        return $requesterProfile->getId()->equals($employee->getId());
    }
}
