<?php

declare(strict_types=1);

namespace App\Controller\Employees;

use App\Entity\User;
use App\Repository\EmployeeRepository;
use App\Service\EmployeeResponseBuilder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of apps.employees.views.EmployeeViewSet.me(). Allowlisted in
 * PasswordChangeRequiredListener since the SPA reads this on bootstrap to
 * decide whether to render the change-password gate.
 */
final class EmployeeMeController
{
    public function __construct(
        private readonly EmployeeRepository $employees,
        private readonly EmployeeResponseBuilder $responseBuilder,
    ) {
    }

    #[Route('/api/v1/employees/me/', name: 'employees_me', methods: ['GET'])]
    public function __invoke(#[CurrentUser] User $user): JsonResponse
    {
        $profile = $this->employees->findByUser($user);
        if ($profile === null) {
            return new JsonResponse(['detail' => 'No employee profile linked to this account.'], 404);
        }

        return new JsonResponse($this->responseBuilder->buildDetail($profile, $user->hasAdminRole()));
    }
}
