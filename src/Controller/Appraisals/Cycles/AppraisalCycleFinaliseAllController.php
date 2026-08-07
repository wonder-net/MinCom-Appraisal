<?php

declare(strict_types=1);

namespace App\Controller\Appraisals\Cycles;

use App\Enum\AppraisalStatus;
use App\Repository\AppraisalCycleRepository;
use App\Repository\AppraisalRepository;
use App\Service\CalibrationService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Port of AppraisalCycleViewSet.finalise_all(). HR Admin/SYSTEM_ADMIN
 * only. Transitions every SIGNED_OFF appraisal in the cycle to
 * FINALISED, matching Django's bulk `.update(status=FINALISED,
 * previous_status=SIGNED_OFF)`.
 *
 * Calibration (product roadmap item, see CalibrationSession's
 * docblock): this bulk path bypasses TransitionValidator/
 * WorkflowGuardService entirely (forceStatus(), not a validated
 * transition), so the calibration gate has to be checked directly
 * here too — one of three paths to FINALISED, all three must agree.
 * Appraisals whose department hasn't completed calibration are simply
 * skipped, same as Django's original bulk `.update()` silently
 * skipping rows outside its WHERE clause.
 */
#[IsGranted('IS_ADMIN')]
final class AppraisalCycleFinaliseAllController
{
    public function __construct(
        private readonly AppraisalCycleRepository $cycles,
        private readonly AppraisalRepository $appraisals,
        private readonly CalibrationService $calibration,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/v1/appraisals/cycles/{id}/finalise-all/', name: 'appraisal_cycles_finalise_all', methods: ['POST'], requirements: ['id' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $id): JsonResponse
    {
        $cycle = Uuid::isValid($id) ? $this->cycles->find(Uuid::fromString($id)) : null;
        if ($cycle === null) {
            throw new NotFoundHttpException();
        }

        $finalisedCount = 0;
        $skippedForCalibration = 0;
        $this->em->wrapInTransaction(function () use ($cycle, &$finalisedCount, &$skippedForCalibration): void {
            foreach ($this->appraisals->findSignedOffByCycle($cycle) as $appraisal) {
                if (!$this->calibration->isComplete($appraisal)) {
                    ++$skippedForCalibration;
                    continue;
                }
                $appraisal->forceStatus(AppraisalStatus::FINALISED);
                $appraisal->setPreviousStatus(AppraisalStatus::SIGNED_OFF);
                ++$finalisedCount;
            }

            $this->em->flush();
        });

        return new JsonResponse(['finalised' => $finalisedCount, 'skipped_for_calibration' => $skippedForCalibration]);
    }
}
