<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Notification;

/**
 * Port of apps.notifications.serializers.NotificationSerializer.
 * `recipient` is deliberately omitted (implicit from auth scoping).
 */
final class NotificationResponseBuilder
{
    /**
     * @return array<string, mixed>
     */
    public function build(Notification $notification): array
    {
        return [
            'id' => (string) $notification->getId(),
            'event_type' => $notification->getEventType(),
            'title' => $notification->getTitle(),
            'message' => $notification->getMessage(),
            'is_read' => $notification->isRead(),
            'appraisal' => $notification->getAppraisal() !== null ? (string) $notification->getAppraisal()->getId() : null,
            'related_object_type' => $notification->getRelatedObjectType(),
            'related_object_id' => $notification->getRelatedObjectId() !== null ? (string) $notification->getRelatedObjectId() : null,
            'created_at' => $notification->getCreatedAt()->format(\DateTimeInterface::ATOM),
        ];
    }
}
