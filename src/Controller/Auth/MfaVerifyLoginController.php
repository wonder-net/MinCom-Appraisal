<?php

declare(strict_types=1);

namespace App\Controller\Auth;

use App\Dto\Auth\MfaVerifyLoginRequest;
use App\Repository\UserRepository;
use App\Service\AuditService;
use App\Service\MfaChallengeCache;
use App\Service\MfaLoginAttemptCache;
use App\Service\MfaService;
use App\Service\TokenIssuer;
use App\Service\UserSummaryBuilder;
use App\Validation\ValidationErrorFactory;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.accounts.views.MFAVerifyLoginView: the second step of login
 * for MFA-enrolled users. Public (no Bearer token) — the user has only
 * passed the password check so far, identified via the short-lived
 * mfa_token from LoginController's challenge response.
 */
final class MfaVerifyLoginController
{
    public function __construct(
        private readonly MfaChallengeCache $challengeCache,
        private readonly MfaLoginAttemptCache $attemptCache,
        private readonly UserRepository $users,
        private readonly MfaService $mfa,
        private readonly TokenIssuer $tokenIssuer,
        private readonly UserSummaryBuilder $userSummaryBuilder,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
        private readonly AuditService $auditService,
    ) {
    }

    #[Route('/api/v1/auth/mfa/verify-login/', name: 'auth_mfa_verify_login', methods: ['POST'])]
    public function __invoke(Request $request, #[MapRequestPayload] MfaVerifyLoginRequest $body): JsonResponse
    {
        $hasCode = $body->code !== null && $body->code !== '';
        $hasRecoveryCode = $body->recoveryCode !== null && $body->recoveryCode !== '';

        if (!$hasCode && !$hasRecoveryCode) {
            throw ValidationErrorFactory::field('non_field_errors', "Either 'code' or 'recovery_code' must be provided.");
        }
        if ($hasCode && $hasRecoveryCode) {
            throw ValidationErrorFactory::field('non_field_errors', "Provide either 'code' or 'recovery_code', not both.");
        }

        $userId = $this->challengeCache->resolveUserId($body->mfaToken);
        if ($userId === null) {
            $this->logger->info('MFA verify-login failed: expired or invalid mfa_token.');

            return $this->mfaTokenExpiredResponse();
        }

        if ($this->attemptCache->getAttempts($body->mfaToken) >= MfaLoginAttemptCache::MAX_ATTEMPTS) {
            $this->challengeCache->invalidate($body->mfaToken);
            $this->attemptCache->forget($body->mfaToken);
            $this->logger->warning('MFA verify-login blocked: max attempts exceeded.');

            return $this->mfaTokenExpiredResponse();
        }

        $user = $this->users->find(Uuid::fromString($userId));
        if ($user === null) {
            $this->logger->warning('MFA verify-login failed: user not found [user_id={id}]', ['id' => $userId]);

            return $this->mfaTokenExpiredResponse();
        }

        $verified = $hasCode
            ? ($user->getMfaSecret() !== null && $this->mfa->verifyTotp($user->getMfaSecret(), $body->code))
            : $this->mfa->verifyRecoveryCode($user, $body->recoveryCode);

        if (!$verified) {
            $newAttempts = $this->attemptCache->incrementAndGet($body->mfaToken, MfaChallengeCache::TTL_SECONDS);

            if ($newAttempts >= MfaLoginAttemptCache::MAX_ATTEMPTS) {
                $this->challengeCache->invalidate($body->mfaToken);
                $this->attemptCache->forget($body->mfaToken);
                $this->logger->warning('MFA verify-login: max attempts reached, mfa_token invalidated [user_id={id}]', ['id' => (string) $user->getId()]);
            }

            $this->logger->info('MFA verify-login failed: invalid code [user_id={id}, attempts={attempts}]', [
                'id' => (string) $user->getId(),
                'attempts' => $newAttempts,
            ]);
            $this->auditService->log('user.mfa_verify_failed', 'User', $user->getId(), $user, null, null, $request->getClientIp(), [
                'reason' => 'invalid_code',
                'attempts' => $newAttempts,
                'max_attempts' => MfaLoginAttemptCache::MAX_ATTEMPTS,
            ]);

            return AuthErrorResponses::simple('Invalid verification code', 'INVALID_MFA_CODE', 401);
        }

        // Single-use: consume the challenge regardless of outcome above.
        $this->challengeCache->invalidate($body->mfaToken);
        $this->attemptCache->forget($body->mfaToken);

        if ($user->getAssignedRoles()->count() === 0) {
            $this->logger->info('MFA verify-login blocked: user has no SPA roles assigned [user_id={id}]', ['id' => (string) $user->getId()]);

            return AuthErrorResponses::simple(
                'This account does not have access to the application. If you are a system administrator, sign in at /admin/login/.',
                'NO_SPA_ROLES_ASSIGNED',
                403,
            );
        }

        $tokens = $this->tokenIssuer->issueForNewSession($user);

        $user->setLastLogin(new \DateTimeImmutable());
        $this->em->flush();

        $this->logger->info('MFA verify-login successful [user_id={id}]', ['id' => (string) $user->getId()]);
        $this->auditService->log('user.login', 'User', $user->getId(), $user, null, null, $request->getClientIp(), ['email' => $user->getEmail(), 'mfa_verified' => true]);

        return new JsonResponse([
            'access' => $tokens['access'],
            'refresh' => $tokens['refresh'],
            'user' => $this->userSummaryBuilder->build($user),
            'must_change_password' => $user->getLastPasswordChange() === null,
        ]);
    }

    private function mfaTokenExpiredResponse(): JsonResponse
    {
        return AuthErrorResponses::simple('MFA token is invalid or expired.', 'MFA_TOKEN_EXPIRED', 401);
    }
}
