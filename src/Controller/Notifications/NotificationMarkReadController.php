<?php

declare(strict_types=1);

namespace App\Controller\Notifications;

use App\Entity\User;
use App\Repository\NotificationRepository;
use App\Service\NotificationResponseBuilder;
use App\Service\UnreadNotificationCountCache;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of MarkReadView: unscoped fetch by id so 404 (doesn't exist) is
 * distinguishable from 403 (exists, not owned by requester). Idempotent
 * — a no-op if already read.
 */
final class NotificationMarkReadController
{
    public function __construct(
        private readonly NotificationRepository $notifications,
        private readonly NotificationResponseBuilder $responseBuilder,
        private readonly UnreadNotificationCountCache $unreadCountCache,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/v1/notifications/{id}/read/', name: 'notifications_mark_read', methods: ['PATCH'], requirements: ['id' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $notification = $this->notifications->findById($id);
        if ($notification === null) {
            throw new NotFoundHttpException();
        }

        if (!$notification->getRecipient()->getId()->equals($user->getId())) {
            return new JsonResponse(['detail' => 'You do not have permission to perform this action.'], 403);
        }

        if (!$notification->isRead()) {
            $notification->markRead();
            $this->em->flush();
            $this->unreadCountCache->invalidate($user);
        }

        return new JsonResponse($this->responseBuilder->build($notification));
    }
}
