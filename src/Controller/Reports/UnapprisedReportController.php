<?php

declare(strict_types=1);

namespace App\Controller\Reports;

use App\Repository\DepartmentRepository;
use App\Service\ReportCycleResolver;
use App\Service\ReportQueryParamValidator;
use App\Service\ReportsCacheService;
use App\Service\UnapprisedReportBuilder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of UnapraisedReportView. HR_ADMIN/SYSTEM_ADMIN/HR_OFFICER only —
 * no EXECUTIVE (Django's IsHRStaff). Cache key matches Django's
 * `unapprised:{cid}:{did}` and is busted by exact key (not tag), since
 * ReportsCacheService::invalidateReports() only busts the
 * no-department-filter variant, mirroring Django's targeted deletes.
 */
#[IsGranted('IS_HR_STAFF')]
final class UnapprisedReportController
{
    public function __construct(
        private readonly ReportCycleResolver $cycleResolver,
        private readonly ReportQueryParamValidator $paramValidator,
        private readonly DepartmentRepository $departments,
        private readonly UnapprisedReportBuilder $builder,
        private readonly ReportsCacheService $cache,
    ) {
    }

    #[Route('/api/v1/reports/unapprised/', name: 'reports_unapprised', methods: ['GET'])]
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

        $cacheKey = 'unapprised.'
            .($cycle !== null ? (string) $cycle->getId() : 'none').'.'
            .($departmentId !== null ? (string) $departmentId : 'none');

        $payload = $this->cache->get($cacheKey, [], fn () => $cycle !== null
            ? $this->builder->build($cycle, $department)
            : ['cycle_id' => null, 'count' => 0, 'employees' => []]);

        return new JsonResponse($payload);
    }
}
