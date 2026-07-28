<?php

declare(strict_types=1);

namespace App\Scheduler;

use App\Message\SendOverdueRemindersMessage;
use Symfony\Component\Scheduler\Attribute\AsSchedule;
use Symfony\Component\Scheduler\RecurringMessage;
use Symfony\Component\Scheduler\Schedule;
use Symfony\Component\Scheduler\ScheduleProviderInterface;

/**
 * Port of Django's CELERY_BEAT_SCHEDULE — currently just the one entry
 * ("send-overdue-reminders", crontab(hour=8, minute=0)). Consumed via
 * `php bin/console messenger:consume scheduler_main`.
 */
#[AsSchedule('main')]
final class MainSchedule implements ScheduleProviderInterface
{
    public function getSchedule(): Schedule
    {
        return (new Schedule())
            ->add(RecurringMessage::cron('0 8 * * *', new SendOverdueRemindersMessage()));
    }
}
