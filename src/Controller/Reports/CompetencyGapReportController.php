<?php

declare(strict_types=1);

namespace App\Controller\Reports;

use App\Service\CompetencyGapReportBuilder;
use App\Service\ReportCycleResolver;
use App\Service\ReportQueryParamValidator;
use App\Service\ReportsCacheService;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of CompetencyGapReportView. HR_ADMIN/SYSTEM_ADMIN/HR_OFFICER
 * only — deliberately NOT EXECUTIVE, unlike the other 13b reports
 * (Django's permission_classes = [IsAuthenticated, IsHRStaff]). Cache
 * key matches Django's `competency_gaps:{cycle_id}:{form_type or 'all'}`.
 */
#[IsGranted('IS_HR_STAFF')]
final class CompetencyGapReportController
{
    public function __construct(
        private readonly ReportCycleResolver $cycleResolver,
        private readonly ReportQueryParamValidator $paramValidator,
        private readonly CompetencyGapReportBuilder $builder,
        private readonly ReportsCacheService $cache,
    ) {
    }

    #[Route('/api/v1/reports/competency-gaps/', name: 'reports_competency_gaps', methods: ['GET'])]
    public function __invoke(Request $request): JsonResponse
    {
        [$cycle, $err] = $this->cycleResolver->resolve($request);
        if ($err !== null) {
            return $err;
        }

        [$formType, $ftErr] = $this->paramValidator->validateFormType($request->query->get('form_type'));
        if ($ftErr !== null) {
            return $ftErr;
        }

        $cacheKey = 'competency_gaps.'
            .($cycle !== null ? (string) $cycle->getId() : 'none').'.'
            .($formType?->value ?? 'all');

        $payload = $this->cache->get($cacheKey, [ReportsCacheService::REPORTS_TAG], fn () => $cycle !== null
            ? $this->builder->build($cycle, $formType)
            : ['cycle_id' => null, 'form_type' => $formType?->value, 'gaps' => []]);

        return new JsonResponse($payload);
    }
}
