<?php

declare(strict_types=1);

namespace App\Controller\Calibration;

use App\Repository\DepartmentRepository;
use App\Service\CalibrationService;
use App\Service\ReportCycleResolver;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Calibration (product roadmap item — see CalibrationSession's
 * docblock). The per-department board: every SIGNED_OFF/FINALISED
 * appraisal in this cycle+department, side by side, for HR to compare
 * ratings across managers before marking the session complete.
 *
 * Deliberately uncached (unlike every analytics report in this
 * codebase) — this is an action-oriented tool HR uses right before
 * calling CalibrationCompleteController, and a stale "not complete yet"
 * read immediately after completing would be actively confusing here,
 * not just mildly outdated the way a few minutes of staleness is fine
 * for a dashboard chart.
 */
#[IsGranted('IS_HR_STAFF')]
final class CalibrationBoardController
{
    public function __construct(
        private readonly ReportCycleResolver $cycleResolver,
        private readonly DepartmentRepository $departments,
        private readonly CalibrationService $calibration,
    ) {
    }

    #[Route('/api/v1/calibration/board/', name: 'calibration_board', methods: ['GET'])]
    public function __invoke(Request $request): JsonResponse
    {
        [$cycle, $err] = $this->cycleResolver->resolve($request);
        if ($err !== null) {
            return $err;
        }
        if ($cycle === null) {
            return new JsonResponse(['detail' => 'No cycle_id given and no ACTIVE cycle exists.'], 400);
        }

        $departmentId = $request->query->get('department_id');
        if (!is_string($departmentId) || !Uuid::isValid($departmentId)) {
            return new JsonResponse(['detail' => 'A valid department_id is required.'], 400);
        }

        $department = $this->departments->find($departmentId);
        if ($department === null) {
            return new JsonResponse(['detail' => 'Department not found.'], 404);
        }

        return new JsonResponse($this->calibration->board($cycle, $department));
    }
}
