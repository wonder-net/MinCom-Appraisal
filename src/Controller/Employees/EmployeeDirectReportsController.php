<?php

declare(strict_types=1);

namespace App\Controller\Employees;

use App\Entity\Employee;
use App\Entity\User;
use App\Enum\RoleName;
use App\Repository\EmployeeRepository;
use App\Service\EmployeeResponseBuilder;
use App\Service\OffsetPaginationLinkBuilder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of apps.employees.views.EmployeeViewSet.direct_reports(). HR
 * Admin/SYSTEM_ADMIN/HR_OFFICER/EXECUTIVE can view anyone's direct
 * reports; a Manager can only view their own.
 */
final class EmployeeDirectReportsController
{
    private const DEFAULT_PAGE_SIZE = 20;
    private const MAX_PAGE_SIZE = 100;

    public function __construct(
        private readonly EmployeeRepository $employees,
        private readonly EmployeeResponseBuilder $responseBuilder,
        private readonly OffsetPaginationLinkBuilder $pagination,
    ) {
    }

    #[Route('/api/v1/employees/{id}/direct-reports/', name: 'employees_direct_reports', methods: ['GET'], requirements: ['id' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $id, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $employee = $this->employees->findActiveById($id);
        if ($employee === null) {
            throw new NotFoundHttpException();
        }

        if (!$this->canViewDirectReports($employee, $user)) {
            return new JsonResponse(['detail' => 'You do not have permission to view these direct reports.'], 403);
        }

        $page = max(1, (int) $request->query->get('page', '1'));
        $pageSize = min(self::MAX_PAGE_SIZE, max(1, (int) $request->query->get('page_size', (string) self::DEFAULT_PAGE_SIZE)));

        $result = $this->employees->findActiveDirectReports($employee, $page, $pageSize);

        return new JsonResponse([
            'results' => array_map(fn (Employee $e) => $this->responseBuilder->buildList($e), $result['items']),
            'pagination' => $this->pagination->build($request, $result['count'], $page, $pageSize),
        ]);
    }

    private function canViewDirectReports(Employee $employee, User $user): bool
    {
        if ($this->employees->hasOrgWideVisibility($user)) {
            return true;
        }

        $profile = $this->employees->findByUser($user);

        return $user->hasRole(RoleName::MANAGER) && $profile !== null && $employee->getId()->equals($profile->getId());
    }
}
