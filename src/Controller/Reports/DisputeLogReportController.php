<?php

declare(strict_types=1);

namespace App\Controller\Reports;

use App\Service\DisputeLogReportBuilder;
use App\Service\ReportCycleResolver;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of DisputeLogReportView. Uncached — a low-frequency compliance
 * report, matching Django (no cache.get/set in this view).
 */
#[IsGranted('IS_HR_STAFF')]
final class DisputeLogReportController
{
    public function __construct(
        private readonly ReportCycleResolver $cycleResolver,
        private readonly DisputeLogReportBuilder $builder,
    ) {
    }

    #[Route('/api/v1/reports/disputes/', name: 'reports_disputes', methods: ['GET'])]
    public function __invoke(Request $request): JsonResponse
    {
        [$cycle, $err] = $this->cycleResolver->resolve($request);
        if ($err !== null) {
            return $err;
        }

        if ($cycle === null) {
            return new JsonResponse(['cycle_id' => null, 'count' => 0, 'disputes' => []]);
        }

        return new JsonResponse($this->builder->build($cycle));
    }
}
