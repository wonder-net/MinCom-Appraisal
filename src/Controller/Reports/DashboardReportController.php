<?php

declare(strict_types=1);

namespace App\Controller\Reports;

use App\Service\DashboardReportBuilder;
use App\Service\ReportCycleResolver;
use App\Service\ReportsCacheService;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of DashboardReportView. HR staff (admin tier or HR_OFFICER) or
 * EXECUTIVE (read-only, but every method here is GET anyway).
 * Cache-aside, 300s TTL, tagged `reports` so ReportsCacheService's
 * invalidateReports() also busts it via the dedicated dashboard-key
 * delete (not the tag — dashboard uses a single deterministic key per
 * cycle, matching Django's targeted `cache.delete`, not a glob).
 */
#[IsGranted('IS_HR_STAFF_OR_EXECUTIVE')]
final class DashboardReportController
{
    public function __construct(
        private readonly ReportCycleResolver $cycleResolver,
        private readonly DashboardReportBuilder $builder,
        private readonly ReportsCacheService $cache,
    ) {
    }

    #[Route('/api/v1/reports/dashboard/', name: 'reports_dashboard', methods: ['GET'])]
    public function __invoke(Request $request): JsonResponse
    {
        [$cycle, $err] = $this->cycleResolver->resolve($request);
        if ($err !== null) {
            return $err;
        }

        $cacheKey = 'dashboard.stats.'.($cycle !== null ? (string) $cycle->getId() : 'none');

        $payload = $this->cache->get($cacheKey, [], fn () => $this->builder->build($cycle));

        return new JsonResponse($payload);
    }
}
