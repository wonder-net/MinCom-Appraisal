<?php

declare(strict_types=1);

namespace App\Controller\Auth;

use App\Dto\Auth\LoginRequest;
use App\Entity\User;
use App\Service\AuditService;
use App\Service\BruteForceProtectionService;
use App\Service\LoginIdentifierResolver;
use App\Service\MfaChallengeCache;
use App\Service\TokenIssuer;
use App\Service\TurnstileService;
use App\Service\UserSummaryBuilder;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.accounts.views.LoginView. Every failure path returns the
 * same generic 401 (account-enumeration prevention) except CAPTCHA and the
 * no-SPA-roles cases, which Django deliberately breaks that pattern for
 * (see AuthErrorResponses docblock) — reproduced here exactly, inconsistency
 * included, since the frontend contract already depends on it.
 */
final class LoginController
{
    /** Sentinel resource_id for audit entries with no resolvable user (mirrors Django's uuid.UUID(int=0)). */
    private const NIL_UUID = '00000000-0000-0000-0000-000000000000';

    public function __construct(
        private readonly LoginIdentifierResolver $identifierResolver,
        private readonly BruteForceProtectionService $bruteForce,
        private readonly TurnstileService $turnstile,
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly TokenIssuer $tokenIssuer,
        private readonly UserSummaryBuilder $userSummaryBuilder,
        private readonly MfaChallengeCache $mfaChallengeCache,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
        private readonly AuditService $auditService,
        private readonly bool $mfaRequired,
    ) {
    }

    #[Route('/api/v1/auth/login/', name: 'auth_login', methods: ['POST'])]
    public function __invoke(Request $request, #[MapRequestPayload] LoginRequest $body): JsonResponse
    {
        $correlationId = (string) $request->attributes->get('correlation_id');
        $ipAddress = $request->getClientIp() ?? '';

        [$user, $identifierKind] = $this->identifierResolver->resolve($body->identifier);

        if ($user === null) {
            // Dummy hash: equalises response time whether or not the
            // identifier exists, preventing a timing side-channel.
            $this->passwordHasher->hashPassword(new User('dummy@example.invalid'), $body->password);
            $this->logger->info('Login failed: identifier not found [kind={kind}]', ['kind' => $identifierKind->value]);
            $this->auditService->log('user.login_failed', 'User', Uuid::fromString(self::NIL_UUID), null, null, null, $ipAddress, [
                'identifier' => $body->identifier,
                'identifier_kind' => $identifierKind->value,
                'reason' => 'identifier_not_found',
            ]);

            return AuthErrorResponses::genericAuthFailure($correlationId);
        }

        if (!$user->isActive()) {
            $this->logger->info('Login failed: inactive account [user_id={id}]', ['id' => (string) $user->getId()]);

            return AuthErrorResponses::genericAuthFailure($correlationId);
        }

        [$isLocked, $lockoutRemaining] = $this->bruteForce->checkLockout($user);
        if ($isLocked) {
            $this->logger->warning('Login blocked: account locked [user_id={id}]', ['id' => (string) $user->getId()]);

            return AuthErrorResponses::genericAuthFailure(
                $correlationId,
                $lockoutRemaining,
                $this->bruteForce->isCaptchaRequired($user),
            );
        }

        [$isRateLimited] = $this->bruteForce->checkRateLimit($user);
        if ($isRateLimited) {
            $this->logger->info('Login blocked: rate limited [user_id={id}]', ['id' => (string) $user->getId()]);

            return AuthErrorResponses::genericAuthFailure(
                $correlationId,
                null,
                $this->bruteForce->isCaptchaRequired($user),
            );
        }

        if ($this->bruteForce->isCaptchaRequired($user) && $this->turnstile->isConfigured()) {
            if ($body->captchaToken === null || $body->captchaToken === '') {
                $this->logger->info('Login blocked: CAPTCHA required but not provided [user_id={id}]', ['id' => (string) $user->getId()]);

                return AuthErrorResponses::simple('CAPTCHA verification required', 'CAPTCHA_REQUIRED', 400);
            }

            if (!$this->turnstile->verifyToken($body->captchaToken, $ipAddress)) {
                $this->logger->info('Login blocked: CAPTCHA verification failed [user_id={id}]', ['id' => (string) $user->getId()]);

                return AuthErrorResponses::simple('CAPTCHA verification failed', 'CAPTCHA_FAILED', 400);
            }
        }

        if (!$this->passwordHasher->isPasswordValid($user, $body->password)) {
            $attempt = $this->bruteForce->recordFailedAttempt($user);
            $this->logger->info('Login failed: invalid password [user_id={id}, attempts={attempts}]', [
                'id' => (string) $user->getId(),
                'attempts' => $attempt['attempts'],
            ]);

            if ($attempt['locked']) {
                $this->auditService->log('user.account_locked', 'User', $user->getId(), $user, null, null, $ipAddress, [
                    'email' => $user->getEmail(),
                    'identifier' => $body->identifier,
                    'identifier_kind' => $identifierKind->value,
                    'failed_attempts' => $attempt['attempts'],
                ]);
            }
            $this->auditService->log('user.login_failed', 'User', $user->getId(), $user, null, null, $ipAddress, [
                'email' => $user->getEmail(),
                'identifier' => $body->identifier,
                'identifier_kind' => $identifierKind->value,
                'reason' => 'wrong_password',
                'failed_attempts' => $attempt['attempts'],
            ]);

            return AuthErrorResponses::genericAuthFailure(
                $correlationId,
                $attempt['locked'] ? $attempt['lockoutSeconds'] : null,
                $attempt['captchaRequired'],
            );
        }

        $this->bruteForce->resetAttempts($user);

        // Naked superusers (e.g. bootstrap_superuser) with zero SPA roles are
        // reserved for the Symfony/Django admin surface only. This check
        // runs AFTER password verification so it can't be used as an
        // enumeration oracle.
        if ($user->getAssignedRoles()->count() === 0) {
            $this->logger->info('Login blocked: user has no SPA roles assigned [user_id={id}]', ['id' => (string) $user->getId()]);

            return AuthErrorResponses::simple(
                'This account does not have access to the application. If you are a system administrator, sign in at /admin/login/.',
                'NO_SPA_ROLES_ASSIGNED',
                403,
            );
        }

        if ($user->isMfaEnabled()) {
            $mfaToken = $this->mfaChallengeCache->issue((string) $user->getId());
            $this->logger->info('Login: MFA challenge issued [user_id={id}]', ['id' => (string) $user->getId()]);

            return new JsonResponse(['mfa_required' => true, 'mfa_token' => $mfaToken]);
        }

        $tokens = $this->tokenIssuer->issueForNewSession($user);

        $user->setLastLogin(new \DateTimeImmutable());
        $this->em->flush();

        $this->logger->info('Login successful [user_id={id}]', ['id' => (string) $user->getId()]);
        $this->auditService->log('user.login', 'User', $user->getId(), $user, null, null, $ipAddress, [
            'email' => $user->getEmail(),
            'identifier' => $body->identifier,
            'identifier_kind' => $identifierKind->value,
        ]);

        return new JsonResponse([
            'access' => $tokens['access'],
            'refresh' => $tokens['refresh'],
            'user' => $this->userSummaryBuilder->build($user),
            'must_change_password' => $user->getLastPasswordChange() === null,
            'mfa_setup_required' => $this->mfaRequired,
        ]);
    }
}
