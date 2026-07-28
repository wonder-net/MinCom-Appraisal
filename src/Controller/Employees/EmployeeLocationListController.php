<?php

declare(strict_types=1);

namespace App\Controller\Employees;

use App\Repository\EmployeeRepository;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of apps.employees.views.EmployeeLocationListView.
 */
#[IsGranted('IS_ADMIN')]
final class EmployeeLocationListController
{
    public function __construct(private readonly EmployeeRepository $employees)
    {
    }

    #[Route('/api/v1/employees/locations/', name: 'employees_locations', methods: ['GET'])]
    public function __invoke(): JsonResponse
    {
        return new JsonResponse($this->employees->findDistinctLocations());
    }
}
