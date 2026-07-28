<?php

declare(strict_types=1);

namespace App\Security\Jwt;

/**
 * Per-request holder for the `session_start` value the next minted access
 * token should carry.
 *
 * Login leaves this unset, so JwtCreatedListener defaults session_start to
 * "now" (a fresh session). TokenRefreshController explicitly sets it to the
 * *original* refresh token's sessionStart before minting the new access
 * token, so the absolute-session-timeout clock is never reset by rotation —
 * mirroring Django's CustomTokenObtainPairSerializer / TokenRefreshView
 * (session_start is not in SimpleJWT's no_copy_claims).
 */
final class PendingSessionContext
{
    private ?\DateTimeImmutable $sessionStart = null;

    public function setSessionStart(\DateTimeImmutable $sessionStart): void
    {
        $this->sessionStart = $sessionStart;
    }

    public function consumeSessionStart(): \DateTimeImmutable
    {
        $sessionStart = $this->sessionStart ?? new \DateTimeImmutable();
        $this->sessionStart = null;

        return $sessionStart;
    }
}
