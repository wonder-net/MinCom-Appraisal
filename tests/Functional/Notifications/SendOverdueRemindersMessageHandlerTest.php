<?php

declare(strict_types=1);

namespace App\Tests\Functional\Notifications;

use App\Entity\Appraisal;
use App\Enum\AppraisalStatus;
use App\Factory\AppraisalCycleFactory;
use App\Factory\AppraisalFactory;
use App\Factory\EmployeeFactory;
use App\Message\SendOverdueRemindersMessage;
use App\MessageHandler\SendOverdueRemindersMessageHandler;
use App\Repository\NotificationRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

/**
 * Port of apps.notifications.tests's coverage of send_overdue_reminders:
 * 14-day overdue threshold, per-status recipient roles, the 24h
 * idempotency guard, and the missing-manager warning-not-crash path.
 */
final class SendOverdueRemindersMessageHandlerTest extends KernelTestCase
{
    public function testNotifiesEmployeeForOverdueSelfAssessment(): void
    {
        $employee = EmployeeFactory::new()->create();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $appraisal = AppraisalFactory::new()->create([
            'cycle' => $cycle,
            'employee' => $employee,
            'status' => AppraisalStatus::SELF_ASSESSMENT,
        ]);
        $this->flush();
        $this->backdateCreatedAt($appraisal, 20);

        $this->invokeHandler();

        $notifications = $this->notifications()->findByRecipientPaginated($employee->getUser(), 1, 10);
        self::assertSame(1, $notifications['count']);
        $notification = $notifications['items'][0];
        self::assertSame('appraisal.overdue', $notification->getEventType());
        self::assertSame('Appraisal Action Overdue', $notification->getTitle());
        self::assertStringContainsString('Your appraisal', $notification->getMessage());
    }

    public function testNotifiesManagerForOverdueManagerReview(): void
    {
        $manager = EmployeeFactory::new()->managerial()->create();
        $employee = EmployeeFactory::new()->withManager($manager)->create();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $appraisal = AppraisalFactory::new()->create([
            'cycle' => $cycle,
            'employee' => $employee,
            'status' => AppraisalStatus::MANAGER_REVIEW,
        ]);
        $this->flush();
        $this->backdateCreatedAt($appraisal, 20);

        $this->invokeHandler();

        $managerNotifications = $this->notifications()->findByRecipientPaginated($manager->getUser(), 1, 10);
        self::assertSame(1, $managerNotifications['count']);

        $employeeNotifications = $this->notifications()->findByRecipientPaginated($employee->getUser(), 1, 10);
        self::assertSame(0, $employeeNotifications['count']);
    }

    public function testNotifiesBothPartiesForOverdueDiscussion(): void
    {
        $manager = EmployeeFactory::new()->managerial()->create();
        $employee = EmployeeFactory::new()->withManager($manager)->create();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $appraisal = AppraisalFactory::new()->create([
            'cycle' => $cycle,
            'employee' => $employee,
            'status' => AppraisalStatus::DISCUSSION,
        ]);
        $this->flush();
        $this->backdateCreatedAt($appraisal, 20);

        $this->invokeHandler();

        self::assertSame(1, $this->notifications()->findByRecipientPaginated($manager->getUser(), 1, 10)['count']);
        self::assertSame(1, $this->notifications()->findByRecipientPaginated($employee->getUser(), 1, 10)['count']);
    }

    public function testSkipsAppraisalNotYetOverdue(): void
    {
        $employee = EmployeeFactory::new()->create();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        AppraisalFactory::new()->create([
            'cycle' => $cycle,
            'employee' => $employee,
            'status' => AppraisalStatus::SELF_ASSESSMENT,
        ]);
        $this->flush();

        $this->invokeHandler();

        self::assertSame(0, $this->notifications()->findByRecipientPaginated($employee->getUser(), 1, 10)['count']);
    }

    public function testIdempotentWithinTwentyFourHours(): void
    {
        $employee = EmployeeFactory::new()->create();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $appraisal = AppraisalFactory::new()->create([
            'cycle' => $cycle,
            'employee' => $employee,
            'status' => AppraisalStatus::SELF_ASSESSMENT,
        ]);
        $this->flush();
        $this->backdateCreatedAt($appraisal, 20);

        $this->invokeHandler();
        $this->invokeHandler();

        self::assertSame(1, $this->notifications()->findByRecipientPaginated($employee->getUser(), 1, 10)['count']);
    }

    public function testMissingManagerIsSkippedWithoutError(): void
    {
        $employee = EmployeeFactory::new()->create();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $appraisal = AppraisalFactory::new()->create([
            'cycle' => $cycle,
            'employee' => $employee,
            'status' => AppraisalStatus::MANAGER_REVIEW,
        ]);
        $this->flush();
        $this->backdateCreatedAt($appraisal, 20);

        $this->invokeHandler();

        self::assertSame(0, $this->notifications()->findByRecipientPaginated($employee->getUser(), 1, 10)['count']);
    }

    private function invokeHandler(): void
    {
        self::getContainer()->get(SendOverdueRemindersMessageHandler::class)(new SendOverdueRemindersMessage());
    }

    private function notifications(): NotificationRepository
    {
        return self::getContainer()->get(NotificationRepository::class);
    }

    private function flush(): void
    {
        self::getContainer()->get(EntityManagerInterface::class)->flush();
    }

    private function backdateCreatedAt(Appraisal $appraisal, int $daysAgo): void
    {
        $connection = self::getContainer()->get(EntityManagerInterface::class)->getConnection();
        $connection->executeStatement(
            'UPDATE appraisal SET created_at = :createdAt WHERE id = :id',
            [
                'createdAt' => (new \DateTimeImmutable(sprintf('-%d days', $daysAgo)))->format('Y-m-d H:i:s'),
                'id' => (string) $appraisal->getId(),
            ],
        );
        self::getContainer()->get(EntityManagerInterface::class)->clear();
    }

    protected function setUp(): void
    {
        self::bootKernel();
    }
}
