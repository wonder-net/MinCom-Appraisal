<?php

declare(strict_types=1);

namespace App\Controller\Reports;

use App\Service\CareerAspirationPipelineBuilder;
use App\Service\ReportCycleResolver;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of CareerAspirationPipelineView. Uncached, matching Django (no
 * cache.get/set in this view).
 */
#[IsGranted('IS_HR_STAFF_OR_EXECUTIVE')]
final class CareerAspirationPipelineController
{
    public function __construct(
        private readonly ReportCycleResolver $cycleResolver,
        private readonly CareerAspirationPipelineBuilder $builder,
    ) {
    }

    #[Route('/api/v1/reports/career-pipeline/', name: 'reports_career_pipeline', methods: ['GET'])]
    public function __invoke(Request $request): JsonResponse
    {
        [$cycle, $err] = $this->cycleResolver->resolve($request);
        if ($err !== null) {
            return $err;
        }

        return new JsonResponse($this->builder->build($cycle));
    }
}
