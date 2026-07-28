<?php

declare(strict_types=1);

namespace App\Controller\Auth;

use App\Dto\Auth\PasswordResetConfirmRequest;
use App\Repository\PasswordResetTokenRepository;
use App\Service\AuditService;
use App\Service\PasswordResetTokenService;
use App\Service\TokenService;
use App\Validation\ValidationErrorFactory;
use Doctrine\DBAL\LockMode;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Port of apps.accounts.views.PasswordResetConfirmView. The confirm-match
 * check runs AFTER #[PasswordPolicy] (auto-validated on the DTO before this
 * method executes) — matching DRF's field-level-then-object-level ordering
 * for this particular serializer (see PasswordChangeRequest's docblock for
 * the contrasting order on the change-password flow).
 */
final class PasswordResetConfirmController
{
    private const GENERIC_ERROR = 'This reset link is invalid or has expired.';

    public function __construct(
        private readonly PasswordResetTokenRepository $tokens,
        private readonly PasswordResetTokenService $tokenService,
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly EntityManagerInterface $em,
        private readonly TokenService $refreshTokenService,
        private readonly LoggerInterface $logger,
        private readonly AuditService $auditService,
    ) {
    }

    #[Route('/api/v1/auth/password/reset/confirm/', name: 'auth_password_reset_confirm', methods: ['POST'])]
    public function __invoke(Request $request, #[MapRequestPayload] PasswordResetConfirmRequest $body): JsonResponse
    {
        if ($body->newPassword !== $body->newPasswordConfirm) {
            throw ValidationErrorFactory::field('new_password_confirm', 'Passwords do not match.');
        }

        $tokenHash = $this->tokenService->hashToken($body->token);
        $response = null;

        $this->em->wrapInTransaction(function () use ($tokenHash, $body, $request, &$response): void {
            $resetToken = $this->tokens->findOneByTokenHash($tokenHash);

            if ($resetToken === null) {
                $response = AuthErrorResponses::simple(self::GENERIC_ERROR, 'INVALID_TOKEN', 400);

                return;
            }

            $this->em->lock($resetToken, LockMode::PESSIMISTIC_WRITE);

            $now = new \DateTimeImmutable();
            $user = $resetToken->getUser();

            if (!$resetToken->isValid($now) || !$user->isActive()) {
                $response = AuthErrorResponses::simple(self::GENERIC_ERROR, 'INVALID_TOKEN', 400);

                return;
            }

            $resetToken->markUsed($now);

            $user->setPassword($this->passwordHasher->hashPassword($user, $body->newPassword));
            $user->setLastPasswordChange($now);

            $this->refreshTokenService->revokeAllForUser($user);

            $this->logger->info('Password reset completed [user_id={id}]', ['id' => (string) $user->getId()]);
            // Action name matches Django's literal "PASSWORD_RESET". No
            // metadata: same PII-omission comment as the request flow.
            $this->auditService->log('PASSWORD_RESET', 'User', $user->getId(), $user, null, null, $request->getClientIp());
        });

        return $response ?? new JsonResponse(['message' => 'Password has been reset successfully.']);
    }
}
