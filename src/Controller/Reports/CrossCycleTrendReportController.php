<?php

declare(strict_types=1);

namespace App\Controller\Reports;

use App\Service\CrossCycleTrendReportBuilder;
use App\Service\ReportQueryParamValidator;
use App\Service\ReportsCacheService;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of CrossCycleTrendView. Not scoped to a single resolved cycle —
 * spans all CLOSED/ARCHIVED cycles at once, so there's no `?cycle_id=`
 * param at all (only `?department_id=`). Unlike every other filterable
 * reports endpoint, Django never checks department_id for existence
 * here (no 404 branch) — a nonexistent id just yields empty
 * data_points, matched by not resolving a Department entity at all.
 * Cache key matches Django's `trend:{department_id or 'all'}`.
 */
#[IsGranted('IS_HR_STAFF_OR_EXECUTIVE')]
final class CrossCycleTrendReportController
{
    public function __construct(
        private readonly ReportQueryParamValidator $paramValidator,
        private readonly CrossCycleTrendReportBuilder $builder,
        private readonly ReportsCacheService $cache,
    ) {
    }

    #[Route('/api/v1/reports/trend/', name: 'reports_trend', methods: ['GET'])]
    public function __invoke(Request $request): JsonResponse
    {
        [$departmentId, $deptErr] = $this->paramValidator->validateDepartmentId($request->query->get('department_id'));
        if ($deptErr !== null) {
            return $deptErr;
        }

        $cacheKey = 'trend.'.($departmentId !== null ? (string) $departmentId : 'all');

        $payload = $this->cache->get($cacheKey, [ReportsCacheService::REPORTS_TAG], fn () => $this->builder->build($departmentId));

        return new JsonResponse($payload);
    }
}
