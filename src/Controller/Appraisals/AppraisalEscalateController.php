<?php

declare(strict_types=1);

namespace App\Controller\Appraisals;

use App\Entity\Appraisal;
use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Enum\RoleName;
use App\Repository\EmployeeRepository;
use App\Repository\UserRepository;
use App\Service\AppraisalLinkBuilder;
use App\Service\AppraisalResponseBuilder;
use App\Service\AuditService;
use App\Service\EscalationReasonHasher;
use App\Service\NotificationService;
use App\Service\ReportsCacheService;
use Doctrine\DBAL\LockMode;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Port of EscalateAppraisalView.post(). HR Admin only. Escalates a
 * DISPUTED appraisal to an Executive, transitioning it to DISCUSSION.
 *
 * Uses raw JsonResponse error bodies (not ValidationErrorFactory)
 * throughout, matching Django's hand-rolled Response({...}, status=400)
 * calls here — EnvelopeResponseSubscriber's fallback wrap already
 * reproduces the resulting envelope shape with no extra code needed.
 */
#[IsGranted('IS_ADMIN')]
final class AppraisalEscalateController
{
    private const REASON_MIN_LEN = 10;
    private const REASON_MAX_LEN = 2000;

    public function __construct(
        private readonly UserRepository $users,
        private readonly EmployeeRepository $employees,
        private readonly AppraisalResponseBuilder $responseBuilder,
        private readonly NotificationService $notifications,
        private readonly AppraisalLinkBuilder $linkBuilder,
        private readonly EscalationReasonHasher $reasonHasher,
        private readonly ReportsCacheService $reportsCache,
        private readonly EntityManagerInterface $em,
        private readonly AuditService $auditService,
    ) {
    }

    #[Route('/api/v1/appraisals/{id}/escalate/', name: 'appraisals_escalate', methods: ['POST'], requirements: ['id' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $id, Request $request, #[CurrentUser] User $admin): JsonResponse
    {
        $payload = json_decode($request->getContent(), true) ?? [];

        if (!isset($payload['version']) || !is_int($payload['version'])) {
            return new JsonResponse(['version' => ['A valid integer is required.']], 400);
        }
        $requestVersion = $payload['version'];

        $rawReason = $payload['reason'] ?? '';
        if (!is_string($rawReason)) {
            return new JsonResponse(['reason' => [sprintf('Reason must be at least %d characters.', self::REASON_MIN_LEN)]], 400);
        }
        $reason = trim($rawReason);
        if (mb_strlen($reason) < self::REASON_MIN_LEN) {
            return new JsonResponse(['reason' => [sprintf('Reason must be at least %d characters.', self::REASON_MIN_LEN)]], 400);
        }
        if (mb_strlen($reason) > self::REASON_MAX_LEN) {
            return new JsonResponse(['reason' => [sprintf('Reason must be at most %d characters.', self::REASON_MAX_LEN)]], 400);
        }

        $executiveError = $this->validateExecutiveUserId($payload['executive_user_id'] ?? null);
        if ($executiveError instanceof JsonResponse) {
            return $executiveError;
        }
        $executive = $executiveError;

        if (!Uuid::isValid($id)) {
            throw new NotFoundHttpException();
        }

        $result = $this->em->wrapInTransaction(function () use ($id, $requestVersion, $reason, $executive, $admin, $request): JsonResponse|Appraisal|null {
            $appraisal = $this->em->find(Appraisal::class, Uuid::fromString($id), LockMode::PESSIMISTIC_WRITE);
            if ($appraisal === null) {
                return null;
            }

            if ($appraisal->getVersion() !== $requestVersion) {
                return new JsonResponse([
                    'detail' => 'Conflict: appraisal was modified by another request.',
                    'correlation_id' => (string) Uuid::v4(),
                ], 409);
            }

            if ($appraisal->getEscalatedExecutive() !== null) {
                return new JsonResponse(['detail' => 'Appraisal already escalated — use re-assign endpoint instead.'], 400);
            }

            if (in_array($appraisal->getStatus(), [AppraisalStatus::SIGNED_OFF, AppraisalStatus::FINALISED], true)) {
                return new JsonResponse(['detail' => 'Appraisal is already signed off or finalised.'], 400);
            }

            if ($appraisal->getStatus() !== AppraisalStatus::DISPUTED) {
                return new JsonResponse(['detail' => 'Appraisal is not in DISPUTED status.'], 400);
            }

            $oldStatus = $appraisal->getStatus();
            $appraisal->setEscalatedExecutive($executive);
            $appraisal->setEscalationReason($reason);
            $appraisal->setStatus(AppraisalStatus::DISCUSSION);
            $appraisal->setPreviousStatus($oldStatus);

            $this->em->flush();

            $this->auditService->log(
                'appraisal.escalated',
                'Appraisal',
                $appraisal->getId(),
                $admin,
                ['status' => $oldStatus->value, 'escalated_executive' => null],
                ['status' => AppraisalStatus::DISCUSSION->value, 'escalated_executive' => (string) $executive->getId()],
                $request->getClientIp(),
                [
                    'appraisal_id' => (string) $appraisal->getId(),
                    'to_executive_user' => (string) $executive->getId(),
                    'reason_sha256' => $this->reasonHasher->hash($reason, $appraisal->getId()),
                    'previous_status' => $oldStatus->value,
                    'new_status' => AppraisalStatus::DISCUSSION->value,
                ],
            );

            return $appraisal;
        });

        if ($result === null) {
            throw new NotFoundHttpException();
        }

        if ($result instanceof JsonResponse) {
            return $result;
        }

        $this->dispatchNotifications($result, $executive, $reason);

        // Bust caches for the affected cycle/department, mirroring the
        // workflow engine's standard post-transition behaviour.
        $this->reportsCache->invalidateReports((string) $result->getCycle()->getId(), (string) $result->getEmployee()->getDepartment()->getId());
        $this->reportsCache->invalidateAppraisalPdf((string) $result->getId());

        return new JsonResponse($this->responseBuilder->buildDetail($result));
    }

    /**
     * Port of notify_executive_of_escalation / notify_appraisee_of_escalation
     * / notify_manager_of_escalation, dispatched here (after the
     * escalation transaction has committed) rather than via Django's
     * transaction.on_commit + Celery .delay() — Symfony's equivalent
     * fire-after-commit point is simply "after wrapInTransaction() returns".
     */
    private function dispatchNotifications(Appraisal $appraisal, User $executive, string $reason): void
    {
        $employeeName = $appraisal->getEmployee()->getName();
        $cycleName = $appraisal->getCycle()->getPeriodName();
        $url = $this->linkBuilder->build($appraisal);
        $reasonHash = $this->reasonHasher->hash($reason, $appraisal->getId());
        $executiveName = $this->displayName($executive);

        $this->notifications->create(
            $executive,
            $appraisal,
            'appraisal.escalated',
            sprintf(
                "You have been assigned as the appraisor for %s's appraisal in %s.\n\nReason from HR Admin: %s\n\nOpen the appraisal: %s",
                $employeeName,
                $cycleName,
                $reason,
                $url,
            ),
            relatedObjectType: 'Appraisal',
            relatedObjectId: $appraisal->getId(),
            metadata: ['reason_sha256' => $reasonHash],
        );

        $this->notifications->create(
            $appraisal->getEmployee()->getUser(),
            $appraisal,
            'appraisal.escalated.appraisee',
            sprintf(
                "Your appraisal for %s has been escalated. %s is now your appraisor.\n\nReason from HR Admin: %s\n\nOpen the appraisal: %s",
                $cycleName,
                $executiveName,
                $reason,
                $url,
            ),
            relatedObjectType: 'Appraisal',
            relatedObjectId: $appraisal->getId(),
            metadata: ['reason_sha256' => $reasonHash],
        );

        $manager = $appraisal->getEmployee()->getManager();
        if ($manager !== null) {
            $this->notifications->create(
                $manager->getUser(),
                $appraisal,
                'appraisal.escalated.manager_replaced',
                sprintf(
                    "You have been replaced as appraisor for %s's appraisal in %s. You now have read-only access. %s is the new appraisor.\n\nReason from HR Admin: %s\n\nOpen the appraisal: %s",
                    $employeeName,
                    $cycleName,
                    $executiveName,
                    $reason,
                    $url,
                ),
                relatedObjectType: 'Appraisal',
                relatedObjectId: $appraisal->getId(),
                metadata: ['reason_sha256' => $reasonHash, 'new_executive_id' => (string) $executive->getId()],
            );
        }
    }

    private function displayName(User $user): string
    {
        $profile = $this->employees->findByUser($user);

        return $profile?->getName() ?: $user->getEmail();
    }

    private function validateExecutiveUserId(mixed $executiveUserId): User|JsonResponse
    {
        if ($executiveUserId === null || $executiveUserId === '') {
            return new JsonResponse(['executive_user_id' => ['This field is required.']], 400);
        }

        if (!is_string($executiveUserId) || !Uuid::isValid($executiveUserId)) {
            return new JsonResponse(['executive_user_id' => ['Invalid UUID.']], 400);
        }

        $executive = $this->users->find(Uuid::fromString($executiveUserId));
        if ($executive === null || !$executive->isActive() || !$executive->hasRole(RoleName::EXECUTIVE)) {
            return new JsonResponse(['executive_user_id' => ['User is not an active Executive.']], 400);
        }

        return $executive;
    }
}
