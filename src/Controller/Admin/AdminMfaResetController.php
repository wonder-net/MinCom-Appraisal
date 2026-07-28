<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Controller\Auth\AuthErrorResponses;
use App\Dto\Auth\PasswordConfirmationRequest;
use App\Entity\User;
use App\Repository\RecoveryCodeRepository;
use App\Repository\UserRepository;
use App\Security\Voter\RoleHierarchyVoter;
use App\Service\AuditService;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.accounts.views.AdminMFAResetView. Guard order matches the
 * Django docstring exactly (see there for why): self-reset guard first,
 * then the admin's own password, THEN target lookup/state checks — a wrong
 * password must never be distinguishable from "target has no MFA" by a
 * differing error, so password is checked before anything target-specific.
 */
#[IsGranted(RoleHierarchyVoter::IS_ADMIN)]
final class AdminMfaResetController
{
    public function __construct(
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly UserRepository $users,
        private readonly RecoveryCodeRepository $recoveryCodes,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
        private readonly AuditService $auditService,
    ) {
    }

    #[Route('/api/v1/admin/users/{id}/reset-mfa/', name: 'admin_users_reset_mfa', methods: ['POST'])]
    public function __invoke(string $id, Request $request, #[MapRequestPayload] PasswordConfirmationRequest $body, #[CurrentUser] User $admin): JsonResponse
    {
        if ($id === (string) $admin->getId()) {
            return AuthErrorResponses::simple(
                'Admins cannot reset their own MFA via this endpoint. Use POST /api/v1/auth/mfa/disable/ instead.',
                'SELF_RESET_NOT_ALLOWED',
                400,
            );
        }

        if (!$this->passwordHasher->isPasswordValid($admin, $body->password)) {
            return AuthErrorResponses::simple('Invalid password.', 'INVALID_PASSWORD', 400);
        }

        $target = Uuid::isValid($id) ? $this->users->find(Uuid::fromString($id)) : null;
        if ($target === null || !$target->isActive()) {
            throw new NotFoundHttpException();
        }

        if (!$target->isMfaEnabled()) {
            return AuthErrorResponses::simple('MFA is not enabled for the target user.', 'MFA_NOT_ENABLED', 400);
        }

        $target->setIsMfaEnabled(false);
        $target->setMfaSecret(null);
        $this->em->flush();

        $this->recoveryCodes->deleteAllForUser($target);

        $this->logger->info('MFA reset by admin [target_user_id={target}, actor={actor}]', [
            'target' => (string) $target->getId(),
            'actor' => (string) $admin->getId(),
        ]);
        $this->auditService->log('user.mfa_reset_by_admin', 'User', $target->getId(), $admin, ['is_mfa_enabled' => true], ['is_mfa_enabled' => false, 'reset_by' => (string) $admin->getId()], $request->getClientIp());

        return new JsonResponse([
            'message' => 'MFA reset successfully. The user will be prompted to configure MFA on next sign-in.',
        ]);
    }
}
