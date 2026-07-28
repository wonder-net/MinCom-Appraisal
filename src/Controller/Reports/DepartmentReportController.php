<?php

declare(strict_types=1);

namespace App\Controller\Reports;

use App\Entity\User;
use App\Enum\RoleName;
use App\Repository\DepartmentRepository;
use App\Repository\EmployeeRepository;
use App\Service\DepartmentReportBuilder;
use App\Service\ReportCycleResolver;
use App\Service\ReportsCacheService;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

/**
 * Port of DepartmentReportView. Any authenticated user may call this
 * endpoint (permission check is entirely object-level, done here) —
 * admin tier and EXECUTIVE may access any department; MANAGER only
 * their own department's report; everyone else gets 403.
 */
final class DepartmentReportController
{
    public function __construct(
        private readonly DepartmentRepository $departments,
        private readonly EmployeeRepository $employees,
        private readonly ReportCycleResolver $cycleResolver,
        private readonly DepartmentReportBuilder $builder,
        private readonly ReportsCacheService $cache,
    ) {
    }

    #[Route('/api/v1/reports/department/{deptId}/', name: 'reports_department', methods: ['GET'], requirements: ['deptId' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $deptId, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $department = Uuid::isValid($deptId) ? $this->departments->find(Uuid::fromString($deptId)) : null;
        if ($department === null) {
            throw new NotFoundHttpException();
        }

        if (!$this->checkAccess($user, $department->getId())) {
            return new JsonResponse(['detail' => 'You do not have permission to access this department.'], 403);
        }

        [$cycle, $err] = $this->cycleResolver->resolve($request);
        if ($err !== null) {
            return $err;
        }

        $cacheKey = 'department.stats.'.$deptId.'.'.($cycle !== null ? (string) $cycle->getId() : 'none');

        $payload = $this->cache->get($cacheKey, [], fn () => $this->builder->build($department, $cycle));

        return new JsonResponse($payload);
    }

    private function checkAccess(User $user, Uuid $departmentId): bool
    {
        if ($user->hasAdminRole() || $user->hasRole(RoleName::EXECUTIVE)) {
            return true;
        }

        if ($user->hasRole(RoleName::MANAGER)) {
            $profile = $this->employees->findByUser($user);

            return $profile !== null && $profile->getDepartment()->getId()->equals($departmentId);
        }

        return false;
    }
}
