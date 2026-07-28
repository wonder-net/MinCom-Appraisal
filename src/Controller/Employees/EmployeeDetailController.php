<?php

declare(strict_types=1);

namespace App\Controller\Employees;

use App\Entity\Employee;
use App\Entity\User;
use App\Enum\RoleName;
use App\Repository\EmployeeRepository;
use App\Service\EmployeeResponseBuilder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of apps.employees.views.EmployeeViewSet's retrieve action. The
 * role-scoped queryset means an unauthorised lookup 404s rather than 403s
 * (avoids confirming the resource even exists — the same OWASP-driven
 * choice Django made).
 */
final class EmployeeDetailController
{
    public function __construct(
        private readonly EmployeeRepository $employees,
        private readonly EmployeeResponseBuilder $responseBuilder,
    ) {
    }

    #[Route('/api/v1/employees/{id}/', name: 'employees_detail', methods: ['GET'], requirements: ['id' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $employee = $this->employees->findActiveById($id);
        if ($employee === null || !$this->isVisibleTo($employee, $user)) {
            throw new NotFoundHttpException();
        }

        return new JsonResponse($this->responseBuilder->buildDetail($employee, $user->hasAdminRole()));
    }

    private function isVisibleTo(Employee $employee, User $user): bool
    {
        if ($this->employees->hasOrgWideVisibility($user)) {
            return true;
        }

        $profile = $this->employees->findByUser($user);
        if ($profile === null) {
            return false;
        }

        if ($employee->getId()->equals($profile->getId())) {
            return true;
        }

        return $user->hasRole(RoleName::MANAGER)
            && $employee->getManager() !== null
            && $employee->getManager()->getId()->equals($profile->getId());
    }
}
