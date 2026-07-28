<?php

declare(strict_types=1);

namespace App\EventListener;

use App\Message\SendNotificationEmailMessage;
use App\Repository\NotificationRepository;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\Messenger\Event\WorkerMessageFailedEvent;
use Symfony\Component\Uid\Uuid;

/**
 * Port of send_notification_email's MaxRetriesExceededError handler:
 * once the `notification_email` transport's retry_strategy has
 * exhausted its retries for a SendNotificationEmailMessage, capture the
 * failure to Sentry tagged with notification_id/event_type/appraisal_id
 * — deliberately no employee_name/recipient_name (PII), matching
 * Django's scope exactly.
 */
final class NotificationEmailFailureListener
{
    public function __construct(private readonly NotificationRepository $notifications)
    {
    }

    #[AsEventListener(event: WorkerMessageFailedEvent::class)]
    public function onMessageFailed(WorkerMessageFailedEvent $event): void
    {
        if ($event->willRetry()) {
            return;
        }

        $message = $event->getEnvelope()->getMessage();
        if (!$message instanceof SendNotificationEmailMessage) {
            return;
        }

        $notification = $this->notifications->find(Uuid::fromString($message->notificationId));

        \Sentry\withScope(function (\Sentry\State\Scope $scope) use ($event, $message, $notification): void {
            $scope->setTag('notification_id', $message->notificationId);
            $scope->setTag('event_type', $notification?->getEventType() ?? 'unknown');
            $scope->setTag('appraisal_id', $notification?->getAppraisal() !== null ? (string) $notification->getAppraisal()->getId() : '');
            \Sentry\captureException($event->getThrowable());
        });
    }
}
