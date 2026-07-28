<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Controller\Auth\AuthErrorResponses;
use App\Dto\Auth\PasswordConfirmationRequest;
use App\Entity\User;
use App\Repository\UserRepository;
use App\Security\Voter\RoleHierarchyVoter;
use App\Service\AuditService;
use App\Service\BruteForceProtectionService;
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
 * Port of apps.accounts.views.AdminUnlockUserView. Same guard ordering
 * rationale as AdminMfaResetController: password check before any
 * target-state-dependent branch.
 */
#[IsGranted(RoleHierarchyVoter::IS_ADMIN)]
final class AdminUnlockUserController
{
    public function __construct(
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly UserRepository $users,
        private readonly BruteForceProtectionService $bruteForce,
        private readonly LoggerInterface $logger,
        private readonly AuditService $auditService,
    ) {
    }

    #[Route('/api/v1/admin/users/{id}/unlock/', name: 'admin_users_unlock', methods: ['POST'])]
    public function __invoke(string $id, Request $request, #[MapRequestPayload] PasswordConfirmationRequest $body, #[CurrentUser] User $admin): JsonResponse
    {
        if ($id === (string) $admin->getId()) {
            return AuthErrorResponses::simple('Admins cannot unlock their own account via this endpoint.', 'SELF_UNLOCK_NOT_ALLOWED', 400);
        }

        if (!$this->passwordHasher->isPasswordValid($admin, $body->password)) {
            return AuthErrorResponses::simple('Invalid password.', 'INVALID_PASSWORD', 400);
        }

        $target = Uuid::isValid($id) ? $this->users->find(Uuid::fromString($id)) : null;
        if ($target === null || !$target->isActive()) {
            throw new NotFoundHttpException();
        }

        [$isLocked] = $this->bruteForce->checkLockout($target);
        if (!$isLocked) {
            return AuthErrorResponses::simple('The target user is not currently locked.', 'NOT_LOCKED', 400);
        }

        $priorAttempts = $target->getFailedLoginAttempts();
        $this->bruteForce->resetAttempts($target);

        $this->logger->info('Account unlocked by admin [target_user_id={target}, actor={actor}]', [
            'target' => (string) $target->getId(),
            'actor' => (string) $admin->getId(),
        ]);
        $this->auditService->log(
            'user.account_unlocked_by_admin',
            'User',
            $target->getId(),
            $admin,
            ['is_locked' => true, 'failed_login_attempts' => $priorAttempts],
            ['is_locked' => false, 'failed_login_attempts' => 0, 'unlocked_by' => (string) $admin->getId()],
            $request->getClientIp(),
        );

        return new JsonResponse(['message' => 'Account unlocked successfully. The user can now sign in again.']);
    }
}
