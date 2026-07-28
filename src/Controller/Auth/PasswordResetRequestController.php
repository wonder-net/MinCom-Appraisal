<?php

declare(strict_types=1);

namespace App\Controller\Auth;

use App\Dto\Auth\PasswordResetRequestRequest;
use App\Entity\PasswordResetToken;
use App\Repository\PasswordResetTokenRepository;
use App\Repository\UserRepository;
use App\Service\AuditService;
use App\Service\EmailService;
use App\Service\PasswordResetTokenService;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Port of apps.accounts.views.PasswordResetRequestView. Always returns 200
 * with the same generic message regardless of whether the email exists
 * (account-enumeration prevention).
 */
final class PasswordResetRequestController
{
    private const GENERIC_MESSAGE = 'If that email is registered, a reset link has been sent.';

    public function __construct(
        private readonly UserRepository $users,
        private readonly PasswordResetTokenRepository $tokens,
        private readonly PasswordResetTokenService $tokenService,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
        private readonly AuditService $auditService,
        private readonly EmailService $emailService,
        private readonly string $frontendUrl,
    ) {
    }

    #[Route('/api/v1/auth/password/reset/request/', name: 'auth_password_reset_request', methods: ['POST'])]
    public function __invoke(Request $request, #[MapRequestPayload] PasswordResetRequestRequest $body): JsonResponse
    {
        $user = $this->users->findOneByEmailCaseInsensitive($body->email);

        if ($user === null || !$user->isActive()) {
            return new JsonResponse(['message' => self::GENERIC_MESSAGE]);
        }

        $now = new \DateTimeImmutable();
        $this->tokens->invalidateAllUnused($user, $now);

        $plaintextToken = $this->tokenService->generateToken();
        $tokenHash = $this->tokenService->hashToken($plaintextToken);
        $expiresAt = $this->tokenService->computeExpiry($now);

        $this->em->persist(new PasswordResetToken($user, $tokenHash, $expiresAt));
        $this->em->flush();

        $resetUrl = rtrim($this->frontendUrl, '/').'/reset-password?token='.$plaintextToken;
        $this->emailService->sendPasswordReset($user->getEmail(), $user->getFullName() ?? $user->getEmail(), $resetUrl);
        $this->logger->info('Password reset requested [user_id={id}]', ['id' => (string) $user->getId()]);
        // Action name deliberately uppercase/underscored — matches
        // Django's literal `"PASSWORD_RESET_REQUESTED"`, inconsistent
        // with the dotted-lowercase convention used everywhere else,
        // reproduced as-is. No metadata: Django's comment here notes
        // PII (the email) is intentionally omitted.
        $this->auditService->log('PASSWORD_RESET_REQUESTED', 'User', $user->getId(), $user, null, null, $request->getClientIp());

        return new JsonResponse(['message' => self::GENERIC_MESSAGE]);
    }
}
