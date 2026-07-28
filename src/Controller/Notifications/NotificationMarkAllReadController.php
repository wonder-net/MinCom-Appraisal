<?php

declare(strict_types=1);

namespace App\Controller\Notifications;

use App\Entity\User;
use App\Repository\NotificationRepository;
use App\Service\UnreadNotificationCountCache;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of MarkAllReadView: bulk-updates all of the recipient's unread
 * notifications to read in one query.
 */
final class NotificationMarkAllReadController
{
    public function __construct(
        private readonly NotificationRepository $notifications,
        private readonly UnreadNotificationCountCache $unreadCountCache,
    ) {
    }

    #[Route('/api/v1/notifications/mark-all-read/', name: 'notifications_mark_all_read', methods: ['POST'])]
    public function __invoke(#[CurrentUser] User $user): JsonResponse
    {
        $markedCount = $this->notifications->markAllReadForRecipient($user);
        $this->unreadCountCache->invalidate($user);

        return new JsonResponse(['marked_count' => $markedCount]);
    }
}
