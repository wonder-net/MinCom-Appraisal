<?php

declare(strict_types=1);

namespace App\MessageHandler;

use App\Entity\Notification;
use App\Message\SendNotificationEmailMessage;
use App\Repository\EmployeeRepository;
use App\Repository\NotificationRepository;
use App\Service\AppraisalLinkBuilder;
use App\Service\EmailService;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.notifications.tasks.send_notification_email. Loads the
 * Notification, resolves the branded HTML template for its event_type
 * via EVENT_EMAIL_MAP (port of Django's EVENT_TEMPLATE_MAP), builds the
 * same context Django's `_build_email_context` builds, and sends.
 *
 * Unlike EmailService::send() (used by the synchronous password-reset/
 * welcome-account paths, which swallows mailer exceptions so a delivery
 * failure never fails the enclosing HTTP request), this handler calls
 * EmailService::sendOrThrow() deliberately: letting the exception
 * propagate is what allows Messenger's retry_strategy on the
 * `notification_email` transport to retry, mirroring Django's
 * `self.retry(...)` on SMTP failure.
 */
#[AsMessageHandler]
final class SendNotificationEmailMessageHandler
{
    /**
     * Port of EVENT_TEMPLATE_MAP. Event types not present here (e.g.
     * `status.changed`, `growth_plan.completed`, `appraisal.finalised`,
     * `bulk_import.complete`) have no email — matching Django's `.get()`
     * returning None for the same keys. `appraisal_bulk_import.complete`/
     * `user_bulk_import.completed` are deliberately absent too: those two
     * are dispatched with sendEmail:false and sent directly by their own
     * handlers with job-specific context this generic map can't supply.
     *
     * @var array<string, array{0: string, 1: string}>
     */
    private const EVENT_EMAIL_MAP = [
        'self_assessment.submitted' => ['emails/self_assessment_submitted.html.twig', 'Self-assessment submitted for review'],
        'review.requested' => ['emails/manager_review_completed.html.twig', 'Your manager has completed your review'],
        'discussion.completed' => ['emails/discussion_completed.html.twig', 'Appraisal discussion has been completed'],
        'appraisal.signed_off' => ['emails/appraisal_signed_off.html.twig', 'Appraisal signed off'],
        'appraisal.signed_off.hr' => ['emails/appraisal_signed_off_hr.html.twig', 'Appraisal signed off — ready for finalisation'],
        'dispute.returned_to_discussion' => ['emails/dispute_returned_to_discussion.html.twig', 'Appraisal returned to discussion'],
        'appraisal.disputed' => ['emails/appraisal_disputed.html.twig', 'Appraisal dispute raised'],
        'cycle.activated' => ['emails/cycle_activated.html.twig', 'Your performance appraisal has been initiated'],
        'sign_off.requested' => ['emails/sign_off_requested.html.twig', 'Action required: Please sign your appraisal'],
        'overdue.reminder' => ['emails/overdue_reminder.html.twig', 'Reminder: Your appraisal action is overdue'],
        'appraisal.overdue' => ['emails/overdue_reminder.html.twig', 'Reminder: Your appraisal action is overdue'],
        'appraisal.escalated' => ['emails/appraisal_escalated_executive.html.twig', 'Appraisal Escalated to You — Action Required'],
        'appraisal.escalated.appraisee' => ['emails/appraisal_escalated_appraisee.html.twig', 'Your appraisal has been escalated'],
        'appraisal.escalated.manager_replaced' => ['emails/appraisal_escalated_manager.html.twig', 'An appraisal you managed has been escalated'],
        'appraisal.executive_reassigned' => ['emails/appraisal_executive_reassigned.html.twig', 'Appraisal Re-assigned to You'],
    ];

    /**
     * Event types whose template renders an `escalation_reason` block.
     * Matches Django's `_ESCALATION_REASON_EVENT_TYPES`.
     *
     * @var string[]
     */
    private const ESCALATION_REASON_EVENT_TYPES = [
        'appraisal.escalated',
        'appraisal.escalated.appraisee',
        'appraisal.escalated.manager_replaced',
        'appraisal.executive_reassigned',
    ];

    public function __construct(
        private readonly NotificationRepository $notifications,
        private readonly EmployeeRepository $employees,
        private readonly AppraisalLinkBuilder $linkBuilder,
        private readonly EmailService $emailService,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function __invoke(SendNotificationEmailMessage $message): void
    {
        $notification = $this->notifications->find(Uuid::fromString($message->notificationId));
        if ($notification === null) {
            $this->logger->error('Notification {id} does not exist, skipping email.', ['id' => $message->notificationId]);

            return;
        }

        $recipientEmail = $notification->getRecipient()->getEmail();
        if ($recipientEmail === '') {
            $this->logger->warning('Recipient {recipientId} has no email, skipping notification {id}', [
                'recipientId' => (string) $notification->getRecipient()->getId(),
                'id' => $message->notificationId,
            ]);

            return;
        }

        $template = self::EVENT_EMAIL_MAP[$notification->getEventType()] ?? null;
        if ($template === null) {
            $this->logger->info("No email template for event_type '{eventType}', skipping notification {id}", [
                'eventType' => $notification->getEventType(),
                'id' => $message->notificationId,
            ]);

            return;
        }
        [$templateName, $subject] = $template;

        $context = $this->buildContext($notification);

        $this->emailService->sendOrThrow($recipientEmail, $subject, $templateName, $context);

        $this->logger->info('Notification email sent for notification {id} to recipient {recipientId}', [
            'id' => $message->notificationId,
            'recipientId' => (string) $notification->getRecipient()->getId(),
        ]);
    }

    /**
     * Port of _build_email_context.
     *
     * @return array<string, string|bool>
     */
    private function buildContext(Notification $notification): array
    {
        $recipient = $notification->getRecipient();
        $appraisal = $notification->getAppraisal();

        $recipientProfile = $this->employees->findByUser($recipient);
        $recipientName = $recipientProfile?->getName() ?? '';

        if ($appraisal !== null) {
            $employeeName = $appraisal->getEmployee()->getName();
            $cyclePeriod = $appraisal->getCycle()->getPeriodName();
            $appraisalStatus = $appraisal->getStatus()->value;
            $appraisalUrl = $this->linkBuilder->build($appraisal);
            $isOwnAppraisal = $appraisal->getEmployee()->getUser()->getId()->equals($recipient->getId());
        } else {
            $employeeName = '';
            $cyclePeriod = '';
            $appraisalStatus = '';
            $appraisalUrl = '';
            $isOwnAppraisal = false;
        }

        $escalationReason = '';
        if ($appraisal !== null && in_array($notification->getEventType(), self::ESCALATION_REASON_EVENT_TYPES, true)) {
            $escalationReason = $appraisal->getEscalationReason() ?? '';
        }

        return [
            'recipient_name' => $recipientName,
            'employee_name' => $employeeName,
            'cycle_period' => $cyclePeriod,
            'appraisal_status' => $appraisalStatus,
            'appraisal_url' => $appraisalUrl,
            'event_type' => $notification->getEventType(),
            'is_own_appraisal' => $isOwnAppraisal,
            'escalation_reason' => $escalationReason,
        ];
    }
}
