<?php

declare(strict_types=1);

namespace App\Service;

/**
 * Port of the pure-function helpers in apps.accounts.services: token
 * generation/hashing and expiry computation for password reset flows.
 */
final class PasswordResetTokenService
{
    private const EXPIRY_HOURS = 1;

    public function generateToken(): string
    {
        return bin2hex(random_bytes(32));
    }

    public function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    public function computeExpiry(\DateTimeImmutable $now): \DateTimeImmutable
    {
        return $now->modify(sprintf('+%d hours', self::EXPIRY_HOURS));
    }
}
