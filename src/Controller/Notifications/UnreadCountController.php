<?php

declare(strict_types=1);

namespace App\Controller\Notifications;

use App\Entity\User;
use App\Service\UnreadNotificationCountCache;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of UnreadCountView: cached 60s per recipient.
 */
final class UnreadCountController
{
    public function __construct(private readonly UnreadNotificationCountCache $unreadCountCache)
    {
    }

    #[Route('/api/v1/notifications/unread-count/', name: 'notifications_unread_count', methods: ['GET'])]
    public function __invoke(#[CurrentUser] User $user): JsonResponse
    {
        return new JsonResponse(['unread_count' => $this->unreadCountCache->get($user)]);
    }
}
