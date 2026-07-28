<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Appraisal;
use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Enum\RoleName;
use App\Repository\UserRepository;

/**
 * Port of apps.appraisals.workflow.{_dispatch_transition_notifications,
 * _determine_notification_recipient, _collect_disputed_recipient_ids}.
 * Called by WorkflowService inside the same transaction as the status
 * change, matching Django's placement (step 7 of do_transition).
 */
final class AppraisalTransitionNotifier
{
    /**
     * @var array<string, string>
     */
    private const TRANSITION_NOTIFICATIONS = [
        'SELF_ASSESSMENT|MANAGER_REVIEW' => 'self_assessment.submitted',
        'MANAGER_REVIEW|DISCUSSION' => 'review.requested',
        'DISCUSSION|GROWTH_PLANNING' => 'discussion.completed',
        'GROWTH_PLANNING|PENDING_SIGNOFF' => 'sign_off.requested',
        'PENDING_SIGNOFF|SIGNED_OFF' => 'appraisal.signed_off',
        'PENDING_SIGNOFF|DISPUTED' => 'appraisal.disputed',
        'DISPUTED|DISCUSSION' => 'dispute.returned_to_discussion',
        'SIGNED_OFF|FINALISED' => 'status.changed',
    ];

    public function __construct(
        private readonly NotificationService $notifications,
        private readonly UserRepository $users,
    ) {
    }

    public function dispatch(Appraisal $appraisal, AppraisalStatus $oldStatus, AppraisalStatus $toStatus, User $requestingUser): void
    {
        $eventType = self::TRANSITION_NOTIFICATIONS[$oldStatus->value.'|'.$toStatus->value] ?? 'status.changed';
        $message = sprintf('Appraisal status changed from %s to %s.', $oldStatus->label(), $toStatus->label());

        if ($eventType === 'appraisal.disputed') {
            foreach ($this->collectDisputedRecipients($appraisal) as $recipient) {
                $this->notifications->create($recipient, $appraisal, $eventType, $message);
            }

            return;
        }

        if ($oldStatus === AppraisalStatus::PENDING_SIGNOFF && $toStatus === AppraisalStatus::SIGNED_OFF) {
            foreach ($this->partyRecipients($appraisal) as $recipient) {
                $this->notifications->create($recipient, $appraisal, $eventType, 'Appraisal has been signed off by both parties.');
            }
            foreach ($this->users->findAllByRole(RoleName::HR_ADMIN) as $hrAdmin) {
                $this->notifications->create($hrAdmin, $appraisal, 'appraisal.signed_off.hr', 'Appraisal has been signed off and is ready for finalisation.');
            }

            return;
        }

        if ($oldStatus === AppraisalStatus::DISPUTED && $toStatus === AppraisalStatus::DISCUSSION) {
            foreach ($this->partyRecipients($appraisal) as $recipient) {
                $this->notifications->create($recipient, $appraisal, $eventType, 'The appraisal dispute has been reviewed and returned to the discussion stage for resolution.');
            }

            return;
        }

        $recipient = $this->determineRecipient($appraisal, $requestingUser);
        if ($recipient !== null) {
            $this->notifications->create($recipient, $appraisal, $eventType, $message);
        }
    }

    /**
     * Port of _determine_notification_recipient: employee submits ->
     * notify manager; manager/HR acts -> notify employee.
     */
    private function determineRecipient(Appraisal $appraisal, User $requestingUser): ?User
    {
        $employeeUser = $appraisal->getEmployee()->getUser();

        if ($employeeUser->getId()->equals($requestingUser->getId())) {
            $manager = $appraisal->getEmployee()->getManager();

            return $manager?->getUser();
        }

        return $employeeUser;
    }

    /**
     * @return list<User>
     */
    private function partyRecipients(Appraisal $appraisal): array
    {
        $recipients = [$appraisal->getEmployee()->getUser()];
        $manager = $appraisal->getEmployee()->getManager();
        if ($manager !== null) {
            $recipients[] = $manager->getUser();
        }

        return $this->dedupeById($recipients);
    }

    /**
     * Port of _collect_disputed_recipient_ids: employee + manager (if
     * set) + all HR_ADMIN users. SYSTEM_ADMIN is deliberately excluded
     * — it shares HR_ADMIN's permission surface but isn't part of the
     * HR-facing workflow audience.
     *
     * @return list<User>
     */
    private function collectDisputedRecipients(Appraisal $appraisal): array
    {
        return $this->dedupeById([...$this->partyRecipients($appraisal), ...$this->users->findAllByRole(RoleName::HR_ADMIN)]);
    }

    /**
     * @param list<User> $users
     * @return list<User>
     */
    private function dedupeById(array $users): array
    {
        $seen = [];
        $result = [];
        foreach ($users as $user) {
            $key = (string) $user->getId();
            if (!isset($seen[$key])) {
                $seen[$key] = true;
                $result[] = $user;
            }
        }

        return $result;
    }
}
