<?php

declare(strict_types=1);

namespace App\Message;

/**
 * Port of apps.notifications.tasks.send_overdue_reminders — dispatched
 * daily by App\Scheduler\MainSchedule rather than Celery Beat.
 */
final class SendOverdueRemindersMessage
{
}
