<?php

declare(strict_types=1);

namespace App\Controller\Auth;

use App\Dto\Auth\RefreshTokenRequest;
use App\Entity\RefreshToken;
use App\Repository\UserRepository;
use App\Security\Jwt\PendingSessionContext;
use App\Service\AuditService;
use Gesdinet\JWTRefreshTokenBundle\Generator\RefreshTokenGeneratorInterface;
use Gesdinet\JWTRefreshTokenBundle\Model\RefreshTokenManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.accounts.views.TokenRefreshView. Rotation is performed
 * manually here (delete-then-create) rather than via Gesdinet's own
 * refresh endpoint/listener, because the pre-checks (absolute session
 * timeout, user active status) and the error envelope must run first and
 * in this exact shape — the same "plain controller, not framework
 * convention" call the migration plan makes for every auth/MFA endpoint.
 */
final class TokenRefreshController
{
    /** Sentinel resource_id for audit entries with no resolvable user (mirrors Django's uuid.UUID(int=0)). */
    private const NIL_UUID = '00000000-0000-0000-0000-000000000000';

    public function __construct(
        private readonly RefreshTokenManagerInterface $refreshTokenManager,
        private readonly RefreshTokenGeneratorInterface $refreshTokenGenerator,
        private readonly UserRepository $users,
        private readonly JWTTokenManagerInterface $jwtManager,
        private readonly PendingSessionContext $pendingSessionContext,
        private readonly LoggerInterface $logger,
        private readonly AuditService $auditService,
        private readonly int $refreshTokenTtl,
        private readonly int $sessionAbsoluteTimeoutHours,
    ) {
    }

    #[Route('/api/v1/auth/token/refresh/', name: 'auth_token_refresh', methods: ['POST'])]
    public function __invoke(Request $request, #[MapRequestPayload] RefreshTokenRequest $body): JsonResponse
    {
        $correlationId = (string) $request->attributes->get('correlation_id');

        $oldToken = $this->refreshTokenManager->get($body->refresh);

        if ($oldToken === null || $oldToken->getValid() < new \DateTime()) {
            $this->logger->info('Token refresh denied: token not found or expired.');
            $this->auditService->log('user.token_refresh_failed', 'User', Uuid::fromString(self::NIL_UUID), null, null, null, $request->getClientIp(), ['reason' => 'token_not_found_or_expired']);

            return AuthErrorResponses::detailed('Token is invalid or expired.', 'AUTHENTICATION_FAILED', 401, $correlationId);
        }

        $sessionStart = $oldToken instanceof RefreshToken
            ? $oldToken->getSessionStart()
            : new \DateTimeImmutable();

        $maxAge = new \DateInterval(sprintf('PT%dH', $this->sessionAbsoluteTimeoutHours));
        if ((new \DateTimeImmutable()) > $sessionStart->add($maxAge)) {
            $this->logger->info('Token refresh denied: absolute session timeout exceeded.');

            return AuthErrorResponses::simple('Session has expired. Please log in again.', 'SESSION_EXPIRED', 401);
        }

        $user = $this->users->findOneByEmail($oldToken->getUsername());

        if ($user === null) {
            $this->logger->info('Token refresh denied: user not found.');

            return AuthErrorResponses::detailed('Token is invalid or expired.', 'AUTHENTICATION_FAILED', 401, $correlationId);
        }

        if (!$user->isActive()) {
            $this->logger->info('Token refresh denied: deactivated user [user_id={id}]', ['id' => (string) $user->getId()]);
            $this->auditService->log('user.token_refresh_denied', 'User', $user->getId(), $user, null, null, $request->getClientIp(), ['reason' => 'account_deactivated', 'email' => $user->getEmail()]);

            return AuthErrorResponses::simple('Account is deactivated.', 'ACCOUNT_DEACTIVATED', 401);
        }

        // Rotate: delete the consumed token, mint a fresh one carrying the
        // same sessionStart forward (never reset by rotation).
        $this->refreshTokenManager->delete($oldToken);

        $newToken = $this->refreshTokenGenerator->createForUserWithTtl($user, $this->refreshTokenTtl);
        if ($newToken instanceof RefreshToken) {
            $newToken->setSessionStart($sessionStart);
        }
        $this->refreshTokenManager->save($newToken);

        $this->pendingSessionContext->setSessionStart($sessionStart);
        $accessToken = $this->jwtManager->create($user);

        $this->logger->info('Token refreshed successfully [user_id={id}]', ['id' => (string) $user->getId()]);
        $this->auditService->log('user.token_refreshed', 'User', $user->getId(), $user, null, null, $request->getClientIp(), ['email' => $user->getEmail()]);

        return new JsonResponse([
            'access' => $accessToken,
            'refresh' => $newToken->getRefreshToken(),
        ]);
    }
}
