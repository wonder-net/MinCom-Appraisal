<?php

declare(strict_types=1);

namespace App\Controller\Auth;

use App\Dto\Auth\RefreshTokenRequest;
use App\Entity\User;
use App\Service\AuditService;
use Gesdinet\JWTRefreshTokenBundle\Model\RefreshTokenManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of apps.accounts.views.LogoutView: deletes (blacklists) only the ONE
 * refresh token supplied — not every session for the user. That broader
 * "revoke everything" behaviour is a separate operation (Django's
 * TokenService.revoke_all_tokens_for_user, used by password-change/admin
 * actions, not plain logout) and isn't wired to this endpoint.
 */
final class LogoutController
{
    public function __construct(
        private readonly RefreshTokenManagerInterface $refreshTokenManager,
        private readonly LoggerInterface $logger,
        private readonly AuditService $auditService,
    ) {
    }

    #[Route('/api/v1/auth/logout/', name: 'auth_logout', methods: ['POST'])]
    public function __invoke(Request $request, #[MapRequestPayload] RefreshTokenRequest $body, #[CurrentUser] User $user): JsonResponse
    {
        $correlationId = (string) $request->attributes->get('correlation_id');

        $token = $this->refreshTokenManager->get($body->refresh);

        if ($token === null) {
            $this->logger->info('Logout failed: invalid token [user_id={id}]', ['id' => (string) $user->getId()]);

            return AuthErrorResponses::detailed('Token is invalid or expired.', 'AUTHENTICATION_FAILED', 401, $correlationId);
        }

        if ($token->getUsername() !== $user->getUserIdentifier()) {
            $this->logger->warning('Logout denied: token ownership mismatch [authenticated_user={id}]', ['id' => (string) $user->getId()]);

            return AuthErrorResponses::detailed(
                'You do not have permission to perform this action.',
                'TOKEN_OWNERSHIP_MISMATCH',
                403,
                $correlationId,
            );
        }

        $this->refreshTokenManager->delete($token);

        $this->logger->info('Logout successful [user_id={id}]', ['id' => (string) $user->getId()]);
        $this->auditService->log('user.logout', 'User', $user->getId(), $user, null, null, $request->getClientIp(), ['email' => $user->getEmail()]);

        return new JsonResponse(['message' => 'Successfully logged out.']);
    }
}
