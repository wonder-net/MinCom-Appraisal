<?php

declare(strict_types=1);

namespace App\Service;

use Psr\Cache\CacheItemPoolInterface;

/**
 * Port of DepartmentListView's cache-aside ("departments:list", 1800s TTL),
 * invalidated whenever DepartmentService auto-creates a department.
 */
final class DepartmentListCache
{
    private const KEY = 'departments.list';
    private const TTL_SECONDS = 1_800;

    public function __construct(private readonly CacheItemPoolInterface $cache)
    {
    }

    /**
     * @return list<array{id: string, name: string}>|null
     */
    public function get(): ?array
    {
        $item = $this->cache->getItem(self::KEY);

        return $item->isHit() ? $item->get() : null;
    }

    /**
     * @param list<array{id: string, name: string}> $departments
     */
    public function set(array $departments): void
    {
        $item = $this->cache->getItem(self::KEY);
        $item->set($departments);
        $item->expiresAfter(self::TTL_SECONDS);
        $this->cache->save($item);
    }

    public function invalidate(): void
    {
        $this->cache->deleteItem(self::KEY);
    }
}
