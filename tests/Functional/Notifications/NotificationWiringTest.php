<?php

declare(strict_types=1);

namespace App\Tests\Functional\Notifications;

use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Enum\RoleName;
use App\Factory\AppraisalCycleFactory;
use App\Factory\AppraisalFactory;
use App\Factory\BscPerspectiveFactory;
use App\Factory\EmployeeFactory;
use App\Factory\KeyDeliverableFactory;
use App\Factory\RoleFactory;
use App\Factory\UserFactory;
use App\Repository\NotificationRepository;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Port of apps.appraisals.tests.test_notification_wiring's core
 * assertions: cycle activation, workflow transitions, and escalation
 * all create the expected Notification rows for the expected
 * recipients. Email-dispatch assertions are omitted (deferred — see
 * NotificationService's class docblock).
 */
final class NotificationWiringTest extends WebTestCase
{
    public function testCycleActivationNotifiesAppraiseeWhenSelfRatingEnabled(): void
    {
        $client = static::createClient();
        $managerEmployee = EmployeeFactory::new()->managerial()->create();
        $employee = EmployeeFactory::new()->withManager($managerEmployee)->create();
        $cycle = AppraisalCycleFactory::new()->create(['selfRatingEnabled' => true]);
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('POST', '/api/v1/appraisals/cycles/'.$cycle->getId().'/activate/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);

        $em = static::getContainer()->get(EntityManagerInterface::class);
        $freshEmployeeUser = $em->getRepository(User::class)->find($employee->getUser()->getId());
        \assert($freshEmployeeUser instanceof User);

        /** @var NotificationRepository $notifications */
        $notifications = static::getContainer()->get(NotificationRepository::class);
        $result = $notifications->findByRecipientPaginated($freshEmployeeUser, 1, 20);
        self::assertSame(1, $result['count']);
        self::assertSame('cycle.activated', $result['items'][0]->getEventType());
    }

    public function testWorkflowTransitionNotifiesManagerWhenAppraiseeSubmits(): void
    {
        $client = static::createClient();
        $managerEmployee = EmployeeFactory::new()->managerial()->create();
        $managerEmployee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::MANAGER]));
        $employee = EmployeeFactory::new()->withManager($managerEmployee)->create();
        $employee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $appraisal = AppraisalFactory::new()->create(['cycle' => $cycle, 'employee' => $employee, 'status' => AppraisalStatus::SELF_ASSESSMENT]);
        $perspective = BscPerspectiveFactory::new()->create(['weightCap' => '1.0000']);
        KeyDeliverableFactory::new()->create(['appraisal' => $appraisal, 'perspective' => $perspective, 'weight' => '1.0000', 'selfRating' => '4.00']);
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $token] = $this->login($employee->getUser(), $client);
        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/transition/', server: $this->authHeader($token), content: json_encode([
            'to_status' => 'MANAGER_REVIEW',
            'version' => 1,
        ]));

        self::assertResponseStatusCodeSame(200);

        $em = static::getContainer()->get(EntityManagerInterface::class);
        $freshManagerUser = $em->getRepository(User::class)->find($managerEmployee->getUser()->getId());
        \assert($freshManagerUser instanceof User);

        /** @var NotificationRepository $notifications */
        $notifications = static::getContainer()->get(NotificationRepository::class);
        $result = $notifications->findByRecipientPaginated($freshManagerUser, 1, 20);
        self::assertSame(1, $result['count']);
        self::assertSame('self_assessment.submitted', $result['items'][0]->getEventType());
    }

    public function testEscalationNotifiesExecutiveAppraiseeAndOriginalManager(): void
    {
        $client = static::createClient();
        $managerEmployee = EmployeeFactory::new()->managerial()->create();
        $employee = EmployeeFactory::new()->withManager($managerEmployee)->create();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $appraisal = AppraisalFactory::new()->create(['cycle' => $cycle, 'employee' => $employee, 'status' => AppraisalStatus::DISPUTED]);
        $executive = UserFactory::new()->withRoles(RoleName::EXECUTIVE)->create();
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/escalate/', server: $this->authHeader($token), content: json_encode([
            'executive_user_id' => (string) $executive->getId(),
            'reason' => 'Manager bias has been alleged by the appraisee.',
            'version' => $appraisal->getVersion(),
        ]));

        self::assertResponseStatusCodeSame(200);

        $em = static::getContainer()->get(EntityManagerInterface::class);
        /** @var NotificationRepository $notifications */
        $notifications = static::getContainer()->get(NotificationRepository::class);
        /** @var UserRepository $users */
        $users = static::getContainer()->get(UserRepository::class);

        $freshExecutive = $users->find($executive->getId());
        \assert($freshExecutive instanceof User);
        $execResult = $notifications->findByRecipientPaginated($freshExecutive, 1, 20);
        self::assertSame(1, $execResult['count']);
        self::assertSame('appraisal.escalated', $execResult['items'][0]->getEventType());

        $freshEmployeeUser = $users->find($employee->getUser()->getId());
        \assert($freshEmployeeUser instanceof User);
        $appraiseeResult = $notifications->findByRecipientPaginated($freshEmployeeUser, 1, 20);
        self::assertSame(1, $appraiseeResult['count']);
        self::assertSame('appraisal.escalated.appraisee', $appraiseeResult['items'][0]->getEventType());

        $freshManagerUser = $users->find($managerEmployee->getUser()->getId());
        \assert($freshManagerUser instanceof User);
        $managerResult = $notifications->findByRecipientPaginated($freshManagerUser, 1, 20);
        self::assertSame(1, $managerResult['count']);
        self::assertSame('appraisal.escalated.manager_replaced', $managerResult['items'][0]->getEventType());
    }

    /**
     * @return array{0: KernelBrowser, 1: string}
     */
    private function loginAsRole(KernelBrowser $client, RoleName $role): array
    {
        $user = UserFactory::new()->withRoles($role)->create();
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        return $this->login($user, $client);
    }

    /**
     * @return array{0: KernelBrowser, 1: string}
     */
    private function login(User $user, KernelBrowser $client): array
    {
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $freshUser = $em->getRepository(User::class)->find($user->getId());
        \assert($freshUser instanceof User);
        $freshUser->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        $em->flush();

        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => $freshUser->getEmail(),
            'password' => UserFactory::DEFAULT_PASSWORD,
        ]));
        $login = json_decode($client->getResponse()->getContent(), true)['data'];

        return [$client, $login['access']];
    }

    /**
     * @return array<string, string>
     */
    private function authHeader(string $accessToken): array
    {
        return ['CONTENT_TYPE' => 'application/json', 'HTTP_AUTHORIZATION' => 'Bearer '.$accessToken];
    }
}
