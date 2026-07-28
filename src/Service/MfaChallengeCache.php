<?php

declare(strict_types=1);

namespace App\Service;

use Psr\Cache\CacheItemPoolInterface;
use Symfony\Component\Uid\Uuid;

/**
 * Server-side store correlating an MFA challenge token to the user who
 * passed the password check, mirroring Django's cache.set(mfa_token:<uuid>,
 * user_id, timeout=300) in LoginView. Backed by the app cache pool
 * (filesystem locally, Redis in containers) rather than a dedicated Redis
 * client, since nothing else needs this data to be shared beyond a single
 * cache backend.
 */
final class MfaChallengeCache
{
    private const PREFIX = 'mfa_token.';
    public const TTL_SECONDS = 300;

    public function __construct(private readonly CacheItemPoolInterface $cache)
    {
    }

    public function issue(string $userId): string
    {
        $token = Uuid::v4()->toRfc4122();

        $item = $this->cache->getItem(self::PREFIX.$token);
        $item->set($userId);
        $item->expiresAfter(self::TTL_SECONDS);
        $this->cache->save($item);

        return $token;
    }

    public function resolveUserId(string $token): ?string
    {
        $item = $this->cache->getItem(self::PREFIX.$token);

        return $item->isHit() ? $item->get() : null;
    }

    public function invalidate(string $token): void
    {
        $this->cache->deleteItem(self::PREFIX.$token);
    }
}
