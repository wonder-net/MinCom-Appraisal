<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Appraisal;
use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Exception\OptimisticLockException;
use Doctrine\DBAL\LockMode;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.appraisals.workflow.do_transition. Runs inside a single
 * DB transaction with a pessimistic row lock on the appraisal (matching
 * Django's select_for_update()) to prevent TOCTOU races between the
 * version check and the write.
 */
final class WorkflowService
{
    public function __construct(
        private readonly TransitionValidator $validator,
        private readonly ScoreEngine $scoreEngine,
        private readonly AppraisalTransitionNotifier $notifier,
        private readonly ReportsCacheService $reportsCache,
        private readonly EntityManagerInterface $em,
        private readonly AuditService $auditService,
    ) {
    }

    public function doTransition(string $appraisalId, AppraisalStatus $toStatus, User $user, int $version): ?Appraisal
    {
        $appraisal = $this->em->wrapInTransaction(function () use ($appraisalId, $toStatus, $user, $version): ?Appraisal {
            $appraisal = $this->em->find(Appraisal::class, Uuid::fromString($appraisalId), LockMode::PESSIMISTIC_WRITE);
            if ($appraisal === null) {
                return null;
            }

            if ($appraisal->getVersion() !== $version) {
                throw new OptimisticLockException();
            }

            $this->validator->validate($appraisal, $toStatus, $user);

            $oldStatus = $appraisal->getStatus();

            if ($oldStatus === AppraisalStatus::MANAGER_REVIEW && $toStatus === AppraisalStatus::DISCUSSION) {
                $this->scoreEngine->computeScores($appraisal);
            }

            $appraisal->setPreviousStatus($oldStatus);
            $appraisal->setStatus($toStatus);

            if ($toStatus === AppraisalStatus::PENDING_SIGNOFF) {
                // First entry: 0 -> 1. Re-entry after dispute: N -> N+1.
                // Bumped on every transition into PENDING_SIGNOFF, not
                // only dispute round-trips, so every signature recorded
                // while in PENDING_SIGNOFF carries the current round.
                $appraisal->setSigningRound($appraisal->getSigningRound() + 1);
            }

            $this->em->flush();

            $this->auditService->log(
                'appraisal.transition',
                'Appraisal',
                $appraisal->getId(),
                $user,
                ['status' => $oldStatus->value],
                ['status' => $toStatus->value],
                null,
                ['from_status' => $oldStatus->value, 'to_status' => $toStatus->value],
            );

            $this->notifier->dispatch($appraisal, $oldStatus, $toStatus, $user);

            return $appraisal;
        });

        if ($appraisal !== null) {
            $this->reportsCache->invalidateReports((string) $appraisal->getCycle()->getId(), (string) $appraisal->getEmployee()->getDepartment()->getId());
            $this->reportsCache->invalidateAppraisalPdf($appraisalId);
        }

        return $appraisal;
    }
}
