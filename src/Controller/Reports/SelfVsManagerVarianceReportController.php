<?php

declare(strict_types=1);

namespace App\Controller\Reports;

use App\Repository\DepartmentRepository;
use App\Service\ReportCycleResolver;
use App\Service\ReportQueryParamValidator;
use App\Service\ReportsCacheService;
use App\Service\SelfVsManagerVarianceReportBuilder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of SelfVsManagerVarianceView. Cache key matches Django's
 * `variance:{cycle_id}:{department_id or 'all'}`.
 */
#[IsGranted('IS_HR_STAFF_OR_EXECUTIVE')]
final class SelfVsManagerVarianceReportController
{
    public function __construct(
        private readonly ReportCycleResolver $cycleResolver,
        private readonly ReportQueryParamValidator $paramValidator,
        private readonly DepartmentRepository $departments,
        private readonly SelfVsManagerVarianceReportBuilder $builder,
        private readonly ReportsCacheService $cache,
    ) {
    }

    #[Route('/api/v1/reports/variance/', name: 'reports_variance', methods: ['GET'])]
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

        $cacheKey = 'variance.'
            .($cycle !== null ? (string) $cycle->getId() : 'none').'.'
            .($departmentId !== null ? (string) $departmentId : 'all');

        $payload = $this->cache->get($cacheKey, [ReportsCacheService::REPORTS_TAG], fn () => $cycle !== null
            ? $this->builder->build($cycle, $department)
            : ['cycle_id' => null, 'self_rating_enabled' => false, 'kd_variances' => [], 'competency_variances' => []]);

        return new JsonResponse($payload);
    }
}
