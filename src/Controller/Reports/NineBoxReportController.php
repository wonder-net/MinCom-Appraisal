<?php

declare(strict_types=1);

namespace App\Controller\Reports;

use App\Service\NineBoxReportBuilder;
use App\Service\ReportCycleResolver;
use App\Service\ReportsCacheService;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * 9-box talent grid (product roadmap item — see NineBoxReportBuilder's
 * docblock). Same shape as every other cycle-scoped analytics report:
 * ?cycle_id= optional (falls back to the ACTIVE cycle), cached under
 * the shared `reports` tag so it's busted by the same broad
 * invalidation every workflow transition already triggers
 * (WorkflowService::transition() calls invalidateReports() on every
 * status change, which — since growth plans, and therefore
 * potential_rating, are only ever editable during GROWTH_PLANNING,
 * long before an appraisal can reach FINALISED — already covers this
 * report without any extra invalidation call needed elsewhere).
 */
#[IsGranted('IS_HR_STAFF_OR_EXECUTIVE')]
final class NineBoxReportController
{
    public function __construct(
        private readonly ReportCycleResolver $cycleResolver,
        private readonly NineBoxReportBuilder $builder,
        private readonly ReportsCacheService $cache,
    ) {
    }

    #[Route('/api/v1/reports/nine-box/', name: 'reports_nine_box', methods: ['GET'])]
    public function __invoke(Request $request): JsonResponse
    {
        [$cycle, $err] = $this->cycleResolver->resolve($request);
        if ($err !== null) {
            return $err;
        }

        $cacheKey = 'nine_box.'.($cycle !== null ? (string) $cycle->getId() : 'none');

        $payload = $this->cache->get($cacheKey, [ReportsCacheService::REPORTS_TAG], fn () => $cycle !== null
            ? $this->builder->build($cycle)
            : ['cycle_id' => null, 'total_finalised' => 0, 'rated_count' => 0, 'unrated_count' => 0, 'unrated_employees' => [], 'grid' => []]);

        return new JsonResponse($payload);
    }
}
