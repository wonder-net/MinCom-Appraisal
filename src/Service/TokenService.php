<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\User;
use App\Repository\RefreshTokenRepository;
use Psr\Log\LoggerInterface;

/**
 * Port of apps.accounts.services.TokenService.revoke_all_tokens_for_user:
 * blanket session revocation used by password change/reset, not by plain
 * logout (which only removes the one token supplied — see LogoutController).
 */
final class TokenService
{
    public function __construct(
        private readonly RefreshTokenRepository $refreshTokens,
        private readonly LoggerInterface $logger,
        private readonly AuditService $auditService,
    ) {
    }

    public function revokeAllForUser(User $user): int
    {
        $revoked = $this->refreshTokens->deleteAllForUsername($user->getUserIdentifier());

        $this->logger->info('Revoked {count} token(s) for user {id}', [
            'count' => $revoked,
            'id' => (string) $user->getId(),
        ]);

        // Django distinguishes total_outstanding (pre-revocation count)
        // from revoked_count (newly blacklisted) since it uses a
        // blacklist-table model; Gesdinet's manager deletes rows
        // outright, so both counts collapse to the same value here.
        $this->auditService->log(
            'user.tokens_revoked',
            'User',
            $user->getId(),
            $user,
            null,
            ['revoked_count' => $revoked, 'total_outstanding' => $revoked],
            null,
            ['revoked_count' => $revoked, 'total_outstanding' => $revoked],
        );

        return $revoked;
    }
}
