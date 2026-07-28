<?php

declare(strict_types=1);

namespace App\Service;

use Psr\Cache\CacheItemPoolInterface;

/**
 * Holds the provisional TOTP secret between MFASetupView (generates it) and
 * MFAVerifyView (confirms it and persists it to the user) — mirrors
 * Django's cache.set(mfa_setup:<user_id>, secret, timeout=600).
 */
final class MfaSetupCache
{
    private const PREFIX = 'mfa_setup.';
    private const TTL_SECONDS = 600;

    public function __construct(private readonly CacheItemPoolInterface $cache)
    {
    }

    public function store(string $userId, string $secret): void
    {
        $item = $this->cache->getItem(self::PREFIX.$userId);
        $item->set($secret);
        $item->expiresAfter(self::TTL_SECONDS);
        $this->cache->save($item);
    }

    public function get(string $userId): ?string
    {
        $item = $this->cache->getItem(self::PREFIX.$userId);

        return $item->isHit() ? $item->get() : null;
    }

    public function forget(string $userId): void
    {
        $this->cache->deleteItem(self::PREFIX.$userId);
    }
}
