<?php

declare(strict_types=1);

namespace App\Service;

use Psr\Cache\CacheItemPoolInterface;

/**
 * Port of AdminCompetencyListCreateView's cache-aside behaviour: two keys
 * ("competencies:active" for the default listing, "competencies:all" for
 * HR Admin's ?include_inactive=true), both 3600s TTL, both invalidated
 * together whenever a competency is created or updated.
 */
final class CompetencyCache
{
    private const KEY_ACTIVE = 'competencies.active';
    private const KEY_ALL = 'competencies.all';
    private const TTL_SECONDS = 3_600;

    public function __construct(private readonly CacheItemPoolInterface $cache)
    {
    }

    /**
     * @return list<array<string, mixed>>|null
     */
    public function get(bool $includeInactive): ?array
    {
        $item = $this->cache->getItem($includeInactive ? self::KEY_ALL : self::KEY_ACTIVE);

        return $item->isHit() ? $item->get() : null;
    }

    /**
     * @param list<array<string, mixed>> $competencies
     */
    public function set(bool $includeInactive, array $competencies): void
    {
        $item = $this->cache->getItem($includeInactive ? self::KEY_ALL : self::KEY_ACTIVE);
        $item->set($competencies);
        $item->expiresAfter(self::TTL_SECONDS);
        $this->cache->save($item);
    }

    public function invalidateAll(): void
    {
        $this->cache->deleteItems([self::KEY_ACTIVE, self::KEY_ALL]);
    }
}
