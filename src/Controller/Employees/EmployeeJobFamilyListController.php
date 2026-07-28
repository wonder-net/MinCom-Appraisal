<?php

declare(strict_types=1);

namespace App\Controller\Employees;

use App\Repository\EmployeeRepository;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of apps.employees.views.EmployeeJobFamilyListView.
 */
#[IsGranted('IS_ADMIN')]
final class EmployeeJobFamilyListController
{
    public function __construct(private readonly EmployeeRepository $employees)
    {
    }

    #[Route('/api/v1/employees/job-families/', name: 'employees_job_families', methods: ['GET'])]
    public function __invoke(): JsonResponse
    {
        return new JsonResponse($this->employees->findDistinctJobFamilies());
    }
}
