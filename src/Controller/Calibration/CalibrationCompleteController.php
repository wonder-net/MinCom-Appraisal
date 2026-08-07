<?php

declare(strict_types=1);

namespace App\Controller\Calibration;

use App\Entity\User;
use App\Repository\AppraisalCycleRepository;
use App\Repository\DepartmentRepository;
use App\Service\CalibrationService;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Calibration (product roadmap item — see CalibrationSession's
 * docblock). Marking a department's calibration COMPLETE is what
 * unlocks FINALISED for every SIGNED_OFF appraisal in it, so this is
 * gated at the same authority level as finalization itself (IS_ADMIN —
 * matches AppraisalCycleFinaliseAllController/AppraisalBulkFinaliseController),
 * not the broader IS_HR_STAFF that can merely view the board.
 */
#[IsGranted('IS_ADMIN')]
final class CalibrationCompleteController
{
    public function __construct(
        private readonly AppraisalCycleRepository $cycles,
        private readonly DepartmentRepository $departments,
        private readonly CalibrationService $calibration,
    ) {
    }

    #[Route('/api/v1/calibration/complete/', name: 'calibration_complete', methods: ['POST'])]
    public function __invoke(Request $request, #[CurrentUser] User $user): JsonResponse
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

        $notes = isset($payload['notes']) && is_string($payload['notes']) && trim($payload['notes']) !== ''
            ? $payload['notes']
            : null;

        $this->calibration->complete($cycle, $department, $user, $notes);

        return new JsonResponse($this->calibration->board($cycle, $department));
    }
}
