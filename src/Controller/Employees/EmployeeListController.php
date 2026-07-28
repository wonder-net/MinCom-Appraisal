<?php

declare(strict_types=1);

namespace App\Controller\Employees;

use App\Entity\Employee;
use App\Entity\User;
use App\Repository\EmployeeRepository;
use App\Service\EmployeeResponseBuilder;
use App\Service\OffsetPaginationLinkBuilder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of apps.employees.views.EmployeeViewSet.list()/get_queryset():
 * RBAC-scoped (admin-tier/HR_OFFICER/EXECUTIVE see all active employees;
 * MANAGER sees self + direct reports; everyone else sees only their own
 * record), optionally filtered by ?search=, page-number paginated.
 */
final class EmployeeListController
{
    private const SEARCH_MAX_LENGTH = 100;
    private const DEFAULT_PAGE_SIZE = 20;
    private const MAX_PAGE_SIZE = 100;

    public function __construct(
        private readonly EmployeeRepository $employees,
        private readonly EmployeeResponseBuilder $responseBuilder,
        private readonly OffsetPaginationLinkBuilder $pagination,
    ) {
    }

    #[Route('/api/v1/employees/', name: 'employees_list', methods: ['GET'])]
    public function __invoke(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $rawSearch = trim((string) $request->query->get('search', ''));
        if (strlen($rawSearch) > self::SEARCH_MAX_LENGTH) {
            return new JsonResponse(['detail' => 'Search term must not exceed 100 characters.'], 400);
        }

        $page = max(1, (int) $request->query->get('page', '1'));
        $pageSize = min(self::MAX_PAGE_SIZE, max(1, (int) $request->query->get('page_size', (string) self::DEFAULT_PAGE_SIZE)));

        $result = $this->employees->scopedList($user, $rawSearch !== '' ? $rawSearch : null, $page, $pageSize);

        return new JsonResponse([
            'results' => array_map(fn (Employee $e) => $this->responseBuilder->buildList($e), $result['items']),
            'pagination' => $this->pagination->build($request, $result['count'], $page, $pageSize),
        ]);
    }
}
