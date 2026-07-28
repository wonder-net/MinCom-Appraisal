<?php

declare(strict_types=1);

namespace App\Service;

use Psr\Cache\CacheItemPoolInterface;

/**
 * Port of AppraisalCycleViewSet.list()'s cache-aside behaviour: two keys
 * ("cycles:list:all" for HR Admin/HR Officer, "cycles:list:active" for
 * everyone else), both 1800s TTL, both invalidated together on any cycle
 * create/update/activate/close.
 */
final class CycleListCache
{
    private const KEY_ALL = 'cycles.list.all';
    private const KEY_ACTIVE = 'cycles.list.active';
    private const TTL_SECONDS = 1_800;

    public function __construct(private readonly CacheItemPoolInterface $cache)
    {
    }

    public function get(bool $orgWide): ?array
    {
        $item = $this->cache->getItem($orgWide ? self::KEY_ALL : self::KEY_ACTIVE);

        return $item->isHit() ? $item->get() : null;
    }

    public function set(bool $orgWide, array $payload): void
    {
        $item = $this->cache->getItem($orgWide ? self::KEY_ALL : self::KEY_ACTIVE);
        $item->set($payload);
        $item->expiresAfter(self::TTL_SECONDS);
        $this->cache->save($item);
    }

    public function invalidateAll(): void
    {
        $this->cache->deleteItems([self::KEY_ALL, self::KEY_ACTIVE]);
    }
}
