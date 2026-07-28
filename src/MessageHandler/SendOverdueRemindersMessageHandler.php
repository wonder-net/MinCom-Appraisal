<?php

declare(strict_types=1);

namespace App\MessageHandler;

use App\Entity\Appraisal;
use App\Entity\Notification;
use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Message\SendOverdueRemindersMessage;
use App\Repository\AppraisalRepository;
use App\Repository\NotificationRepository;
use App\Service\UnreadNotificationCountCache;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;

/**
 * Port of apps.notifications.tasks.send_overdue_reminders, dispatched
 * daily (08:00) by App\Scheduler\MainSchedule rather than Celery Beat.
 *
 * Creates Notification rows directly with a literal title (matching
 * Django's direct `Notification.objects.create(..., title="Appraisal
 * Action Overdue", ...)` call — deliberately NOT routed through
 * NotificationService::create(), whose EVENT_TITLES-derived title for
 * this event type ("Appraisal Overdue") would not match). Email dispatch
 * (Django's `send_notification_email.delay(...)`) is out of scope here
 * for the same reason it's deferred everywhere else in this port: it
 * needs the ~20-template generic notification-email system that
 * NotificationService's docblock already earmarks as a separate,
 * larger, future milestone — only the 4 auth-flow emails (password
 * reset, welcome, resend-invitation, bulk-import welcome) were in scope
 * for this round.
 */
#[AsMessageHandler]
final class SendOverdueRemindersMessageHandler
{
    /** @var list<AppraisalStatus> */
    private const NON_TERMINAL_STATUSES = [
        AppraisalStatus::SELF_ASSESSMENT,
        AppraisalStatus::MANAGER_REVIEW,
        AppraisalStatus::DISCUSSION,
        AppraisalStatus::GROWTH_PLANNING,
        AppraisalStatus::PENDING_SIGNOFF,
    ];

    /** @var array<string, list<string>> */
    private const STATUS_TO_RECIPIENT_ROLES = [
        'SELF_ASSESSMENT' => ['employee'],
        'MANAGER_REVIEW' => ['manager'],
        'DISCUSSION' => ['employee', 'manager'],
        'GROWTH_PLANNING' => ['manager'],
        'PENDING_SIGNOFF' => ['employee', 'manager'],
    ];

    private const OVERDUE_DAYS = 14;
    private const IDEMPOTENCY_HOURS = 24;
    private const EVENT_TYPE = 'appraisal.overdue';
    private const TITLE = 'Appraisal Action Overdue';

    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly NotificationRepository $notifications,
        private readonly UnreadNotificationCountCache $unreadCountCache,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function __invoke(SendOverdueRemindersMessage $message): void
    {
        $now = new \DateTimeImmutable();
        $cutoff = $now->modify(sprintf('-%d days', self::OVERDUE_DAYS));
        $idempotencyCutoff = $now->modify(sprintf('-%d hours', self::IDEMPOTENCY_HOURS));

        $overdueAppraisals = $this->appraisals->findOverdueInActiveCycles(self::NON_TERMINAL_STATUSES, $cutoff);

        $processed = 0;
        $notified = 0;
        $skipped = 0;
        $errors = 0;

        foreach ($overdueAppraisals as $appraisal) {
            ++$processed;

            try {
                if ($this->notifications->existsForAppraisalSince($appraisal, self::EVENT_TYPE, $idempotencyCutoff)) {
                    ++$skipped;
                    continue;
                }

                $roles = self::STATUS_TO_RECIPIENT_ROLES[$appraisal->getStatus()->value] ?? [];

                foreach ($roles as $role) {
                    $recipientUser = $this->resolveRecipient($appraisal, $role);
                    if ($recipientUser === null) {
                        continue;
                    }

                    $notification = new Notification($recipientUser, $appraisal, self::EVENT_TYPE, self::TITLE, $this->buildMessage($role));
                    $this->em->persist($notification);
                    $this->em->flush();
                    $this->unreadCountCache->invalidate($recipientUser);
                    ++$notified;
                }
            } catch (\Throwable $exc) {
                ++$errors;
                $this->logger->error('Error processing overdue appraisal {id}: {message}', [
                    'id' => (string) $appraisal->getId(),
                    'message' => $exc->getMessage(),
                ]);
                // Bare capture, no scope/tags — matches Django's
                // send_overdue_reminders exactly (its sibling task,
                // send_notification_email, DOES tag appraisal_id/
                // event_type before capturing, but that task is the
                // ~20-template generic notification-email system this
                // port has deliberately deferred — see this class's
                // docblock).
                \Sentry\captureException($exc);
            }
        }

        $this->logger->info('send_overdue_reminders completed: processed={processed}, notified={notified}, skipped={skipped}, errors={errors}', [
            'processed' => $processed,
            'notified' => $notified,
            'skipped' => $skipped,
            'errors' => $errors,
        ]);
    }

    private function resolveRecipient(Appraisal $appraisal, string $role): ?User
    {
        if ($role === 'employee') {
            return $appraisal->getEmployee()->getUser();
        }

        if ($role === 'manager') {
            $manager = $appraisal->getEmployee()->getManager();
            if ($manager === null) {
                $this->logger->warning('Appraisal {id} has no manager for employee {employeeId} — skipping manager notification.', [
                    'id' => (string) $appraisal->getId(),
                    'employeeId' => (string) $appraisal->getEmployee()->getId(),
                ]);

                return null;
            }

            return $manager->getUser();
        }

        return null;
    }

    private function buildMessage(string $role): string
    {
        if ($role === 'manager') {
            return 'An appraisal you are responsible for reviewing has been waiting for your action for over 14 days.';
        }

        return 'Your appraisal has been waiting for your action for over 14 days.';
    }
}
