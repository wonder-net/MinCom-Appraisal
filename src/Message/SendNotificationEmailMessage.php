<?php

declare(strict_types=1);

namespace App\Message;

/**
 * Port of apps.notifications.tasks.send_notification_email's Celery
 * `.delay()` dispatch — carries only the Notification id, matching
 * Django's own task signature (the handler re-derives everything else
 * from the persisted row and its relations, same as the Celery task
 * loading `Notification.objects.select_related(...).get(pk=...)`).
 */
final class SendNotificationEmailMessage
{
    public function __construct(public readonly string $notificationId)
    {
    }
}
