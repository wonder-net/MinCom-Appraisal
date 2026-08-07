<?php

declare(strict_types=1);

namespace App\Controller\Calibration;

use App\Repository\AppraisalCycleRepository;
use App\Repository\DepartmentRepository;
use App\Service\CalibrationService;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Calibration (product roadmap item — see CalibrationSession's
 * docblock). Reverses CalibrationCompleteController — same IS_ADMIN
 * gate, since reopening re-locks finalization for the department just
 * as completing unlocked it. Does NOT revert any appraisal already
 * FINALISED off the back of the now-reopened session; only blocks
 * further ones from that department in this cycle.
 */
#[IsGranted('IS_ADMIN')]
final class CalibrationReopenController
{
    public function __construct(
        private readonly AppraisalCycleRepository $cycles,
        private readonly DepartmentRepository $departments,
        private readonly CalibrationService $calibration,
    ) {
    }

    #[Route('/api/v1/calibration/reopen/', name: 'calibration_reopen', methods: ['POST'])]
    public function __invoke(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent(), true) ?? [];

        $cycleId = $payload['cycle_id'] ?? null;
        if (!is_string($cycleId) || !Uuid::isValid($cycleId)) {
            return new JsonResponse(['detail' => 'A valid cycle_id is required.'], 400);
        }
        $cycle = $this->cycles->find($cycleId);
        if ($cycle === null) {
            return new JsonResponse(['detail' => 'Cycle not found.'], 404);
        }

        $departmentId = $payload['department_id'] ?? null;
        if (!is_string($departmentId) || !Uuid::isValid($departmentId)) {
            return new JsonResponse(['detail' => 'A valid department_id is required.'], 400);
        }
        $department = $this->departments->find($departmentId);
        if ($department === null) {
            return new JsonResponse(['detail' => 'Department not found.'], 404);
        }

        $this->calibration->reopen($cycle, $department);

        return new JsonResponse($this->calibration->board($cycle, $department));
    }
}
