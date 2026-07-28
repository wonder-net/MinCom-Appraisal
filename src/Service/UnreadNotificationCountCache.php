<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\User;
use App\Repository\NotificationRepository;
use Psr\Cache\CacheItemPoolInterface;

/**
 * Port of UnreadCountView's cache-aside behaviour: key
 * "notifications:unread:{user_id}" (PSR-6 forbids ':' in cache keys,
 * so '.' is used instead — same substitution CycleListCache already
 * made), 60s TTL, busted by NotificationService on every new
 * notification and by the mark-read/mark-all-read endpoints.
 */
final class UnreadNotificationCountCache
{
    private const TTL_SECONDS = 60;

    public function __construct(
        private readonly CacheItemPoolInterface $cache,
        private readonly NotificationRepository $notifications,
    ) {
    }

    public function get(User $recipient): int
    {
        $item = $this->cache->getItem($this->key($recipient));
        if ($item->isHit()) {
            return $item->get();
        }

        $count = $this->notifications->countUnreadByRecipient($recipient);
        $item->set($count);
        $item->expiresAfter(self::TTL_SECONDS);
        $this->cache->save($item);

        return $count;
    }

    public function invalidate(User $recipient): void
    {
        $this->cache->deleteItem($this->key($recipient));
    }

    private function key(User $recipient): string
    {
        return 'notifications.unread.'.$recipient->getId()->toRfc4122();
    }
}
