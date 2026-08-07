<?php

declare(strict_types=1);

namespace App\Controller\Appraisals;

use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Repository\AppraisalRepository;
use App\Service\AuditService;
use App\Service\CalibrationService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Port of AppraisalViewSet.bulk_finalise(). HR Admin only. Accepts up to
 * 500 arbitrary appraisal ids and transitions every one currently
 * SIGNED_OFF to FINALISED via a bulk update — appraisals in any other
 * status (or not found) are silently skipped, matching Django exactly.
 * Distinct from the per-cycle `finalise-all` endpoint
 * (AppraisalCycleFinaliseAllController), which takes no ids at all.
 *
 * Unlike Django's queryset.update() (which fires no model signals),
 * this still goes through forceStatus()/setPreviousStatus() per entity
 * rather than a raw SQL update — the audit-log loop needs the concrete
 * ids either way, and Doctrine has no bulk-update-with-unit-of-work
 * shortcut, so per-entity mutation + one flush is the natural
 * equivalent here.
 */
#[IsGranted('IS_ADMIN')]
final class AppraisalBulkFinaliseController
{
    private const MAX_IDS = 500;

    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly AuditService $auditService,
        private readonly CalibrationService $calibration,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/v1/appraisals/bulk-finalise/', name: 'appraisals_bulk_finalise', methods: ['POST'])]
    public function __invoke(Request $request, #[CurrentUser] User $admin): JsonResponse
    {
        $payload = json_decode($request->getContent(), true) ?? [];

        $ids = $payload['appraisal_ids'] ?? [];
        if (!is_array($ids) || $ids === [] || array_is_list($ids) === false) {
            return new JsonResponse(['detail' => 'appraisal_ids must be a non-empty list.'], 400);
        }

        if (count($ids) > self::MAX_IDS) {
            return new JsonResponse(['detail' => sprintf('Cannot finalise more than %d appraisals at once.', self::MAX_IDS)], 400);
        }

        $validIds = [];
        $seen = [];
        foreach ($ids as $id) {
            if (!is_string($id) && !is_int($id)) {
                continue;
            }
            $idString = (string) $id;
            if (Uuid::isValid($idString) && !isset($seen[$idString])) {
                $seen[$idString] = true;
                $validIds[] = Uuid::fromString($idString);
            }
        }

        if ($validIds === []) {
            return new JsonResponse(['detail' => 'No valid appraisal IDs provided.'], 400);
        }

        $ipAddress = $request->getClientIp();

        $finalisedCount = 0;
        $skippedForCalibration = 0;
        $this->em->wrapInTransaction(function () use ($validIds, $admin, $ipAddress, &$finalisedCount, &$skippedForCalibration): void {
            $appraisals = $this->appraisals->findBy(['id' => $validIds, 'status' => AppraisalStatus::SIGNED_OFF]);

            // Calibration (product roadmap item, see CalibrationSession's
            // docblock): this bulk path bypasses TransitionValidator/
            // WorkflowGuardService entirely (forceStatus(), not a
            // validated transition), so the gate has to be checked
            // directly here too — one of three paths to FINALISED, all
            // three must agree.
            $toFinalise = [];
            foreach ($appraisals as $appraisal) {
                if ($this->calibration->isComplete($appraisal)) {
                    $toFinalise[] = $appraisal;
                } else {
                    ++$skippedForCalibration;
                }
            }

            foreach ($toFinalise as $appraisal) {
                $appraisal->forceStatus(AppraisalStatus::FINALISED);
                $appraisal->setPreviousStatus(AppraisalStatus::SIGNED_OFF);
                ++$finalisedCount;
            }

            $this->em->flush();

            foreach ($toFinalise as $appraisal) {
                $this->auditService->log(
                    'appraisal.finalised',
                    'Appraisal',
                    $appraisal->getId(),
                    $admin,
                    ['status' => AppraisalStatus::SIGNED_OFF->value],
                    ['status' => AppraisalStatus::FINALISED->value],
                    $ipAddress,
                );
            }
        });

        return new JsonResponse([
            'finalised' => $finalisedCount,
            'skipped' => count($validIds) - $finalisedCount,
            'skipped_for_calibration' => $skippedForCalibration,
        ]);
    }
}
