<?php

declare(strict_types=1);

namespace App\Controller\Reports;

use App\Repository\DepartmentRepository;
use App\Service\ManagerEffectivenessReportBuilder;
use App\Service\ReportCycleResolver;
use App\Service\ReportQueryParamValidator;
use App\Service\ReportsCacheService;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of ManagerEffectivenessView. Cache key matches Django's
 * `manager_effectiveness:{cycle_id or 'none'}:{department_id or 'none'}`.
 */
#[IsGranted('IS_HR_STAFF_OR_EXECUTIVE')]
final class ManagerEffectivenessReportController
{
    public function __construct(
        private readonly ReportCycleResolver $cycleResolver,
        private readonly ReportQueryParamValidator $paramValidator,
        private readonly DepartmentRepository $departments,
        private readonly ManagerEffectivenessReportBuilder $builder,
        private readonly ReportsCacheService $cache,
    ) {
    }

    #[Route('/api/v1/reports/manager-effectiveness/', name: 'reports_manager_effectiveness', methods: ['GET'])]
    public function __invoke(Request $request): JsonResponse
    {
        [$cycle, $err] = $this->cycleResolver->resolve($request);
        if ($err !== null) {
            return $err;
        }

        [$departmentId, $deptErr] = $this->paramValidator->validateDepartmentId($request->query->get('department_id'));
        if ($deptErr !== null) {
            return $deptErr;
        }
        $department = null;
        if ($departmentId !== null) {
            $department = $this->departments->find($departmentId);
            if ($department === null) {
                return new JsonResponse(['detail' => 'Department not found.'], 404);
            }
        }

        $cacheKey = 'manager_effectiveness.'
            .($cycle !== null ? (string) $cycle->getId() : 'none').'.'
            .($departmentId !== null ? (string) $departmentId : 'none');

        $payload = $this->cache->get($cacheKey, [ReportsCacheService::REPORTS_TAG], fn () => $cycle !== null
            ? $this->builder->build($cycle, $department)
            : ['cycle_id' => null, 'department_id' => null, 'managers' => []]);

        return new JsonResponse($payload);
    }
}
