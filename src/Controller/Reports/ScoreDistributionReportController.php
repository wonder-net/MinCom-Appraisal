<?php

declare(strict_types=1);

namespace App\Controller\Reports;

use App\Repository\DepartmentRepository;
use App\Service\ReportCycleResolver;
use App\Service\ReportQueryParamValidator;
use App\Service\ReportsCacheService;
use App\Service\ScoreDistributionReportBuilder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of ScoreDistributionReportView. Cache key encodes all four
 * filter dimensions (cycle, department, form_type, job_family),
 * matching Django's `score_dist:{cid}:{did}:{ft}:{jf}` key.
 */
#[IsGranted('IS_HR_STAFF_OR_EXECUTIVE')]
final class ScoreDistributionReportController
{
    public function __construct(
        private readonly ReportCycleResolver $cycleResolver,
        private readonly ReportQueryParamValidator $paramValidator,
        private readonly DepartmentRepository $departments,
        private readonly ScoreDistributionReportBuilder $builder,
        private readonly ReportsCacheService $cache,
    ) {
    }

    #[Route('/api/v1/reports/score-distribution/', name: 'reports_score_distribution', methods: ['GET'])]
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

        [$formType, $ftErr] = $this->paramValidator->validateFormType($request->query->get('form_type'));
        if ($ftErr !== null) {
            return $ftErr;
        }

        $jobFamily = $request->query->get('job_family');

        $cacheKey = 'score_dist.'
            .($cycle !== null ? (string) $cycle->getId() : 'none').'.'
            .($departmentId !== null ? (string) $departmentId : 'none').'.'
            .($formType?->value ?? 'none').'.'
            .($jobFamily ?? 'none');

        $payload = $this->cache->get($cacheKey, [ReportsCacheService::REPORTS_TAG], fn () => $cycle !== null
            ? $this->builder->build($cycle, $department, $formType, $jobFamily)
            : ['cycle_id' => null, 'total' => 0, 'bands' => []]);

        return new JsonResponse($payload);
    }
}
