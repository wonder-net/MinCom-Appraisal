<?php

declare(strict_types=1);

namespace App\Controller\Appraisals;

use App\Entity\Appraisal;
use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Enum\RoleName;
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
 * Port of ReassignExecutiveView.post(). HR Admin only. Re-assigns the
 * executive on an already-escalated appraisal; `escalation_reason` is
 * preserved verbatim.
 */
#[IsGranted('IS_ADMIN')]
final class AppraisalReassignExecutiveController
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly AppraisalResponseBuilder $responseBuilder,
        private readonly NotificationService $notifications,
        private readonly AppraisalLinkBuilder $linkBuilder,
        private readonly ReportsCacheService $reportsCache,
        private readonly EntityManagerInterface $em,
        private readonly AuditService $auditService,
        private readonly EscalationReasonHasher $reasonHasher,
    ) {
    }

    #[Route('/api/v1/appraisals/{id}/reassign-executive/', name: 'appraisals_reassign_executive', methods: ['POST'], requirements: ['id' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $id, Request $request, #[CurrentUser] User $admin): JsonResponse
    {
        $payload = json_decode($request->getContent(), true) ?? [];

        if (!isset($payload['version']) || !is_int($payload['version'])) {
            return new JsonResponse(['version' => ['A valid integer is required.']], 400);
        }
        $requestVersion = $payload['version'];

        $executiveError = $this->validateExecutiveUserId($payload['executive_user_id'] ?? null);
        if ($executiveError instanceof JsonResponse) {
            return $executiveError;
        }
        $executive = $executiveError;

        if (!Uuid::isValid($id)) {
            throw new NotFoundHttpException();
        }

        $result = $this->em->wrapInTransaction(function () use ($id, $requestVersion, $executive, $admin, $request): JsonResponse|Appraisal|null {
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

            if ($appraisal->getEscalatedExecutive() === null) {
                return new JsonResponse(['detail' => 'Appraisal has not been escalated.'], 400);
            }

            if (in_array($appraisal->getStatus(), [AppraisalStatus::SIGNED_OFF, AppraisalStatus::FINALISED], true)) {
                return new JsonResponse(['detail' => 'Appraisal is already signed off or finalised.'], 400);
            }

            if ($appraisal->getEscalatedExecutive()->getId()->equals($executive->getId())) {
                return new JsonResponse(['executive_user_id' => ['User is already the current executive.']], 400);
            }

            $previousExecutiveId = $appraisal->getEscalatedExecutive()->getId();
            $appraisal->setEscalatedExecutive($executive);

            $this->em->flush();

            $this->auditService->log(
                'appraisal.executive_reassigned',
                'Appraisal',
                $appraisal->getId(),
                $admin,
                ['escalated_executive' => (string) $previousExecutiveId],
                ['escalated_executive' => (string) $executive->getId()],
                $request->getClientIp(),
                [
                    'appraisal_id' => (string) $appraisal->getId(),
                    'previous_executive' => (string) $previousExecutiveId,
                    'to_executive_user' => (string) $executive->getId(),
                    'original_reason_sha256' => $this->reasonHasher->hash($appraisal->getEscalationReason() ?? '', $appraisal->getId()),
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

        $this->notifications->create(
            $executive,
            $result,
            'appraisal.executive_reassigned',
            sprintf(
                "You have been assigned as the appraisor for %s's appraisal in %s.\n\nOriginal reason from HR Admin: %s\n\nOpen the appraisal: %s",
                $result->getEmployee()->getName(),
                $result->getCycle()->getPeriodName(),
                $result->getEscalationReason() ?? '',
                $this->linkBuilder->build($result),
            ),
            relatedObjectType: 'Appraisal',
            relatedObjectId: $result->getId(),
        );

        $this->reportsCache->invalidateAppraisalPdf((string) $result->getId());

        return new JsonResponse($this->responseBuilder->buildDetail($result));
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
