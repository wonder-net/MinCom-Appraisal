<?php

declare(strict_types=1);

namespace App\Controller\Reports;

use App\Service\ReportCycleResolver;
use App\Service\ReportsCacheService;
use App\Service\TrainingNeedsReportBuilder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of TrainingNeedsReportView. Cache key matches Django's
 * `training_needs:{cid or 'none'}` — busted by exact key (not tag),
 * matching Django's targeted (not glob) invalidation, already wired
 * into ReportsCacheService::invalidateReports() since 13a.
 */
#[IsGranted('IS_HR_STAFF')]
final class TrainingNeedsReportController
{
    public function __construct(
        private readonly ReportCycleResolver $cycleResolver,
        private readonly TrainingNeedsReportBuilder $builder,
        private readonly ReportsCacheService $cache,
    ) {
    }

    #[Route('/api/v1/reports/training-needs/', name: 'reports_training_needs', methods: ['GET'])]
    public function __invoke(Request $request): JsonResponse
    {
        [$cycle, $err] = $this->cycleResolver->resolve($request);
        if ($err !== null) {
            return $err;
        }

        $cacheKey = 'training_needs.'.($cycle !== null ? (string) $cycle->getId() : 'none');

        $payload = $this->cache->get($cacheKey, [], fn () => $this->builder->build($cycle));

        return new JsonResponse($payload);
    }
}
