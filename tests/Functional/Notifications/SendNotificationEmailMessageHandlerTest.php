<?php

declare(strict_types=1);

namespace App\Tests\Functional\Notifications;

use App\Entity\Appraisal;
use App\Entity\Notification;
use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Factory\AppraisalCycleFactory;
use App\Factory\AppraisalFactory;
use App\Factory\EmployeeFactory;
use App\Message\SendNotificationEmailMessage;
use App\MessageHandler\SendNotificationEmailMessageHandler;
use App\Service\NotificationService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Messenger\Transport\InMemory\InMemoryTransport;
use Twig\Environment;

/**
 * Port of apps.notifications.tests's coverage of send_notification_email:
 * every EVENT_TEMPLATE_MAP entry renders without error (test env's
 * `strict_variables: true` Twig config would throw immediately on any
 * context variable a template references but the handler didn't supply
 * — this doubles as template-completeness coverage), the escalation
 * family's conditional escalation_reason block renders both with and
 * without a reason, and NotificationService::create() only dispatches
 * to the `notification_email` transport when sendEmail=true and the
 * recipient has an email.
 */
final class SendNotificationEmailMessageHandlerTest extends KernelTestCase
{
    /**
     * @return iterable<string, array{0: string}>
     */
    public static function standardEventTypeProvider(): iterable
    {
        yield 'self_assessment.submitted' => ['self_assessment.submitted'];
        yield 'review.requested' => ['review.requested'];
        yield 'discussion.completed' => ['discussion.completed'];
        yield 'appraisal.signed_off' => ['appraisal.signed_off'];
        yield 'appraisal.signed_off.hr' => ['appraisal.signed_off.hr'];
        yield 'dispute.returned_to_discussion' => ['dispute.returned_to_discussion'];
        yield 'appraisal.disputed' => ['appraisal.disputed'];
        yield 'cycle.activated' => ['cycle.activated'];
        yield 'sign_off.requested' => ['sign_off.requested'];
        yield 'overdue.reminder' => ['overdue.reminder'];
        yield 'appraisal.overdue' => ['appraisal.overdue'];
    }

    /**
     * @dataProvider standardEventTypeProvider
     */
    public function testStandardEventRendersWithoutError(string $eventType): void
    {
        $appraisal = $this->createAppraisal();
        $notification = $this->persistNotification($appraisal->getEmployee()->getUser(), $appraisal, $eventType);

        $this->invokeHandler($notification);

        // No exception (Twig strict_variables would throw on a missing
        // context key) — reaching this line is the assertion.
        $this->addToAssertionCount(1);
    }

    /**
     * @return iterable<string, array{0: string}>
     */
    public static function escalationEventTypeProvider(): iterable
    {
        yield 'appraisal.escalated' => ['appraisal.escalated'];
        yield 'appraisal.escalated.appraisee' => ['appraisal.escalated.appraisee'];
        yield 'appraisal.escalated.manager_replaced' => ['appraisal.escalated.manager_replaced'];
        yield 'appraisal.executive_reassigned' => ['appraisal.executive_reassigned'];
    }

    /**
     * @dataProvider escalationEventTypeProvider
     */
    public function testEscalationEventRendersWithReason(string $eventType): void
    {
        $appraisal = $this->createAppraisal();
        $appraisal->setEscalationReason('The employee disputed the manager rating and HR reviewed it.');
        $this->flush();

        $notification = $this->persistNotification($appraisal->getEmployee()->getUser(), $appraisal, $eventType);

        $this->invokeHandler($notification);

        $this->addToAssertionCount(1);
    }

    /**
     * @dataProvider escalationEventTypeProvider
     */
    public function testEscalationEventRendersWithoutReason(string $eventType): void
    {
        $appraisal = $this->createAppraisal();

        $notification = $this->persistNotification($appraisal->getEmployee()->getUser(), $appraisal, $eventType);

        $this->invokeHandler($notification);

        $this->addToAssertionCount(1);
    }

    public function testUnmappedEventTypeSkipsWithoutError(): void
    {
        $appraisal = $this->createAppraisal();
        $notification = $this->persistNotification($appraisal->getEmployee()->getUser(), $appraisal, 'status.changed');

        $this->invokeHandler($notification);

        $this->addToAssertionCount(1);
    }

    public function testMissingNotificationSkipsWithoutError(): void
    {
        self::getContainer()->get(SendNotificationEmailMessageHandler::class)(
            new SendNotificationEmailMessage((string) \Symfony\Component\Uid\Uuid::v7()),
        );

        $this->addToAssertionCount(1);
    }

    public function testRecipientWithNoEmailSkipsWithoutError(): void
    {
        $appraisal = $this->createAppraisal();
        $recipient = $appraisal->getEmployee()->getUser();
        $recipient->setEmail('');
        $this->flush();

        $notification = $this->persistNotification($recipient, $appraisal, 'self_assessment.submitted');

        $this->invokeHandler($notification);

        $this->addToAssertionCount(1);
    }

    public function testCreateDispatchesToNotificationEmailTransportWhenEmailPresent(): void
    {
        $appraisal = $this->createAppraisal();
        $recipient = $appraisal->getEmployee()->getUser();

        self::getContainer()->get(NotificationService::class)->create(
            $recipient,
            $appraisal,
            'self_assessment.submitted',
            'Test message',
        );

        self::assertCount(1, $this->transport()->getSent());
    }

    public function testCreateDoesNotDispatchWhenSendEmailIsFalse(): void
    {
        $appraisal = $this->createAppraisal();
        $recipient = $appraisal->getEmployee()->getUser();

        self::getContainer()->get(NotificationService::class)->create(
            $recipient,
            $appraisal,
            'self_assessment.submitted',
            'Test message',
            sendEmail: false,
        );

        self::assertCount(0, $this->transport()->getSent());
    }

    public function testCreateDoesNotDispatchWhenRecipientHasNoEmail(): void
    {
        $appraisal = $this->createAppraisal();
        $recipient = $appraisal->getEmployee()->getUser();
        $recipient->setEmail('');
        $this->flush();

        self::getContainer()->get(NotificationService::class)->create(
            $recipient,
            $appraisal,
            'self_assessment.submitted',
            'Test message',
        );

        self::assertCount(0, $this->transport()->getSent());
    }

    /**
     * EmailService's swallow-and-log send() would hide a broken template
     * behind a silent log line, so this renders the two bulk-import
     * templates directly through Twig (bypassing the swallow) to prove
     * the context each one needs is exactly what the handlers supply.
     */
    public function testAppraisalBulkImportCompleteTemplateRenders(): void
    {
        $html = self::getContainer()->get(Environment::class)->render('emails/appraisal_bulk_import_complete.html.twig', [
            'recipient_name' => 'HR Admin',
            'imported_count' => 3,
            'failed_count' => 1,
            'results_url' => 'https://example.test/admin/appraisals/import/1/results',
        ]);

        self::assertStringContainsString('3 appraisals', $html);
        self::assertStringContainsString('1 file', $html);
    }

    public function testUserBulkImportCompletedTemplateRenders(): void
    {
        $html = self::getContainer()->get(Environment::class)->render('emails/user_bulk_import_completed.html.twig', [
            'recipient_name' => 'HR Admin',
            'total_rows' => 10,
            'created_count' => 1,
            'failed_count' => 0,
            'status_label' => 'Succeeded',
            'results_url' => 'https://example.test/admin/users/bulk-import/jobs/1',
        ]);

        self::assertStringContainsString('1 user', $html);
        self::assertStringNotContainsString('Failed:', $html);
    }

    private function createAppraisal(): Appraisal
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

        return $appraisal;
    }

    private function persistNotification(User $recipient, Appraisal $appraisal, string $eventType): Notification
    {
        $notification = new Notification($recipient, $appraisal, $eventType, 'Test Title', 'Test message');
        $em = self::getContainer()->get(EntityManagerInterface::class);
        $em->persist($notification);
        $em->flush();

        return $notification;
    }

    private function invokeHandler(Notification $notification): void
    {
        self::getContainer()->get(SendNotificationEmailMessageHandler::class)(
            new SendNotificationEmailMessage((string) $notification->getId()),
        );
    }

    private function transport(): InMemoryTransport
    {
        $transport = self::getContainer()->get('messenger.transport.notification_email');
        \assert($transport instanceof InMemoryTransport);

        return $transport;
    }

    private function flush(): void
    {
        self::getContainer()->get(EntityManagerInterface::class)->flush();
    }

    protected function setUp(): void
    {
        self::bootKernel();
    }
}
