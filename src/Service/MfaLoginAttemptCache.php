<?php

declare(strict_types=1);

namespace App\Service;

use Psr\Cache\CacheItemPoolInterface;

/**
 * Brute-force counter for the login MFA challenge, keyed by mfa_token —
 * mirrors Django's mfa_attempts:<mfa_token> cache counter (cache.add +
 * cache.incr). Not backed by an atomic increment (PSR-6 has none), so a
 * read-modify-write race under truly concurrent submissions of the same
 * mfa_token is possible in principle; a deliberately accepted, low-risk
 * simplification given this is an ephemeral, single-use, short-TTL counter.
 */
final class MfaLoginAttemptCache
{
    private const PREFIX = 'mfa_attempts.';
    public const MAX_ATTEMPTS = 3;

    public function __construct(private readonly CacheItemPoolInterface $cache)
    {
    }

    public function getAttempts(string $mfaToken): int
    {
        $item = $this->cache->getItem(self::PREFIX.$mfaToken);

        return $item->isHit() ? (int) $item->get() : 0;
    }

    public function incrementAndGet(string $mfaToken, int $ttlSeconds): int
    {
        $item = $this->cache->getItem(self::PREFIX.$mfaToken);
        $count = ($item->isHit() ? (int) $item->get() : 0) + 1;
        $item->set($count);
        $item->expiresAfter($ttlSeconds);
        $this->cache->save($item);

        return $count;
    }

    public function forget(string $mfaToken): void
    {
        $this->cache->deleteItem(self::PREFIX.$mfaToken);
    }
}
