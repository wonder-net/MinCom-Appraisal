<?php

declare(strict_types=1);

namespace App\Controller\Calibration;

use App\Service\CalibrationService;
use App\Service\ReportCycleResolver;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Calibration (product roadmap item — see CalibrationSession's
 * docblock). Per-department summary for a cycle: which departments
 * have appraisals ready for calibration, and whether each has already
 * been marked complete. ?cycle_id= optional, same fallback-to-ACTIVE
 * convention every other cycle-scoped report uses.
 */
#[IsGranted('IS_HR_STAFF')]
final class CalibrationOverviewController
{
    public function __construct(
        private readonly ReportCycleResolver $cycleResolver,
        private readonly CalibrationService $calibration,
    ) {
    }

    #[Route('/api/v1/calibration/overview/', name: 'calibration_overview', methods: ['GET'])]
    public function __invoke(Request $request): JsonResponse
    {
        [$cycle, $err] = $this->cycleResolver->resolve($request);
        if ($err !== null) {
            return $err;
        }

        if ($cycle === null) {
            return new JsonResponse(['cycle_id' => null, 'departments' => []]);
        }

        return new JsonResponse([
            'cycle_id' => (string) $cycle->getId(),
            'departments' => $this->calibration->overview($cycle),
        ]);
    }
}
