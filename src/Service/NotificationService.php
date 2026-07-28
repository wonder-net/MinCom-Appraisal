<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Appraisal;
use App\Entity\Notification;
use App\Entity\User;
use App\Message\SendNotificationEmailMessage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.notifications.services.create_notification — the
 * canonical cross-app entry point for creating in-app notifications,
 * called from workflow transitions, escalation, cycle activation, and
 * bulk-import completion.
 *
 * Email dispatch (Django's `send_notification_email.delay(...)` Celery
 * task) is `SendNotificationEmailMessage`, dispatched onto the
 * `notification_email` Messenger transport and handled by
 * SendNotificationEmailMessageHandler — the async counterpart to
 * Django's Celery task. Callers that pass `sendEmail: false` (the two
 * bulk-import completion events) send their own bespoke email directly
 * from their own handler instead, matching Django's own bypass.
 */
final class NotificationService
{
    /**
     * @var array<string, string>
     */
    private const EVENT_TITLES = [
        'cycle.activated' => 'Appraisal Cycle Activated',
        'self_assessment.submitted' => 'Self-Assessment Submitted',
        'review.requested' => 'Review Requested',
        'discussion.requested' => 'Discussion Requested',
        'discussion.completed' => 'Discussion Completed',
        'growth_plan.completed' => 'Growth Plan Completed',
        'sign_off.requested' => 'Sign-Off Requested',
        'appraisal.signed_off' => 'Appraisal Signed Off',
        'appraisal.signed_off.hr' => 'Appraisal Ready for Finalisation',
        'dispute.returned_to_discussion' => 'Appraisal Returned to Discussion',
        'appraisal.finalised' => 'Appraisal Finalised',
        'appraisal.disputed' => 'Appraisal Disputed',
        'appraisal.overdue' => 'Appraisal Overdue',
        'overdue.reminder' => 'Overdue Reminder',
        'status.changed' => 'Status Changed',
        'bulk_import.complete' => 'Bulk Import Complete',
        'appraisal_bulk_import.complete' => 'Appraisal Bulk Import Complete',
        'user_bulk_import.completed' => 'User Bulk Import Completed',
        'appraisal.escalated' => 'Appraisal Escalated to You — Action Required',
        'appraisal.escalated.appraisee' => 'Your Appraisal Has Been Escalated',
        'appraisal.escalated.manager_replaced' => 'Your Appraisal Assignment Has Changed',
        'appraisal.executive_reassigned' => 'Appraisal Escalation Re-assigned to You',
    ];

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly UnreadNotificationCountCache $unreadCountCache,
        private readonly MessageBusInterface $bus,
    ) {
    }

    /**
     * @param array<string, mixed> $metadata
     */
    public function create(
        User $recipient,
        ?Appraisal $appraisal,
        string $eventType,
        string $message,
        bool $sendEmail = true,
        string $relatedObjectType = '',
        ?Uuid $relatedObjectId = null,
        array $metadata = [],
    ): Notification {
        $title = self::EVENT_TITLES[$eventType] ?? $this->titleFallback($eventType);

        $notification = new Notification($recipient, $appraisal, $eventType, $title, $message);
        $notification->setRelatedObjectType($relatedObjectType);
        $notification->setRelatedObjectId($relatedObjectId);
        $notification->setMetadata($metadata);

        $this->em->persist($notification);
        $this->em->flush();

        $this->unreadCountCache->invalidate($recipient);

        if ($sendEmail && $recipient->getEmail() !== '') {
            $this->bus->dispatch(new SendNotificationEmailMessage((string) $notification->getId()));
        }

        return $notification;
    }

    private function titleFallback(string $eventType): string
    {
        return ucwords(str_replace(['.', '_'], ' ', $eventType));
    }
}
