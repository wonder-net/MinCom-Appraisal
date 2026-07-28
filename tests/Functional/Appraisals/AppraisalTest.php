<?php

declare(strict_types=1);

namespace App\Tests\Functional\Appraisals;

use App\Entity\User;
use App\Enum\RoleName;
use App\Factory\AppraisalCycleFactory;
use App\Factory\AppraisalFactory;
use App\Factory\EmployeeFactory;
use App\Factory\RoleFactory;
use App\Factory\UserFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class AppraisalTest extends WebTestCase
{
    private const LIST_URL = '/api/v1/appraisals/';

    public function testEmployeeSeesOnlyOwnAppraisal(): void
    {
        $client = static::createClient();
        $employee = EmployeeFactory::new()->create();
        $employee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));
        $employee->getUser()->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        $cycle = AppraisalCycleFactory::new()->active()->create();
        AppraisalFactory::new()->create(['cycle' => $cycle, 'employee' => $employee]);
        AppraisalFactory::new()->create(['cycle' => $cycle]); // unrelated
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $accessToken] = $this->login($employee->getUser(), $client);

        $client->request('GET', self::LIST_URL, server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        self::assertSame(1, json_decode($client->getResponse()->getContent(), true)['meta']['pagination']['count']);
    }

    public function testManagerSeesSelfAndDirectReports(): void
    {
        $client = static::createClient();
        $manager = EmployeeFactory::new()->managerial()->create();
        $manager->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::MANAGER]));
        $manager->getUser()->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        $report = EmployeeFactory::new()->withManager($manager)->create();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        AppraisalFactory::new()->create(['cycle' => $cycle, 'employee' => $manager]);
        AppraisalFactory::new()->create(['cycle' => $cycle, 'employee' => $report]);
        AppraisalFactory::new()->create(['cycle' => $cycle]); // unrelated
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $accessToken] = $this->login($manager->getUser(), $client);

        $client->request('GET', self::LIST_URL, server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        self::assertSame(2, json_decode($client->getResponse()->getContent(), true)['meta']['pagination']['count']);
    }

    public function testHrAdminSeesAllAppraisals(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, static::createClient());
        $cycle = AppraisalCycleFactory::new()->active()->create();
        AppraisalFactory::new()->create(['cycle' => $cycle]);
        AppraisalFactory::new()->create(['cycle' => $cycle]);

        $client->request('GET', self::LIST_URL, server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        self::assertSame(2, json_decode($client->getResponse()->getContent(), true)['meta']['pagination']['count']);
    }

    public function testListRejectsInvalidCycleId(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, static::createClient());

        $client->request('GET', self::LIST_URL.'?cycle_id=not-a-uuid', server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(400);
    }

    public function testListRejectsInvalidStatus(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, static::createClient());

        $client->request('GET', self::LIST_URL.'?status=NOT_A_STATUS', server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(400);
    }

    public function testListRejectsSearchTermOver100Chars(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, static::createClient());

        $client->request('GET', self::LIST_URL.'?search='.str_repeat('a', 101), server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(400);
    }

    public function testListFiltersByCycleAndStatus(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, static::createClient());
        $cycleA = AppraisalCycleFactory::new()->active()->create();
        $cycleB = AppraisalCycleFactory::new()->active()->create();
        AppraisalFactory::new()->create(['cycle' => $cycleA]);
        AppraisalFactory::new()->create(['cycle' => $cycleB]);

        $client->request('GET', self::LIST_URL.'?cycle_id='.$cycleA->getId(), server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        self::assertSame(1, json_decode($client->getResponse()->getContent(), true)['meta']['pagination']['count']);
    }

    public function testDetailReturns404ForNonexistentAppraisal(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, static::createClient());

        $client->request('GET', self::LIST_URL.'01923456-789a-7bcd-8ef0-123456789abc/', server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(404);
    }

    public function testDetailReturns403ForUnauthorizedUser(): void
    {
        $client = static::createClient();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $appraisal = AppraisalFactory::new()->create(['cycle' => $cycle]);
        $appraisalId = (string) $appraisal->getId();
        [$client, $accessToken] = $this->loginAs(RoleName::EMPLOYEE, $client);

        $client->request('GET', self::LIST_URL.$appraisalId.'/', server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(403);
    }

    public function testDetailVisibleToAppraisee(): void
    {
        $client = static::createClient();
        $employee = EmployeeFactory::new()->create();
        $employee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));
        $employee->getUser()->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $appraisal = AppraisalFactory::new()->create(['cycle' => $cycle, 'employee' => $employee]);
        $appraisalId = (string) $appraisal->getId();
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $accessToken] = $this->login($employee->getUser(), $client);

        $client->request('GET', self::LIST_URL.$appraisalId.'/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame($appraisalId, $body['id']);
        self::assertSame([], $body['signatures']);
        self::assertSame(1, $body['version']);
    }

    public function testDetailVisibleToDirectManager(): void
    {
        $client = static::createClient();
        $manager = EmployeeFactory::new()->managerial()->create();
        $manager->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::MANAGER]));
        $manager->getUser()->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        $report = EmployeeFactory::new()->withManager($manager)->create();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $appraisal = AppraisalFactory::new()->create(['cycle' => $cycle, 'employee' => $report]);
        $appraisalId = (string) $appraisal->getId();
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $accessToken] = $this->login($manager->getUser(), $client);

        $client->request('GET', self::LIST_URL.$appraisalId.'/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        self::assertSame($appraisalId, json_decode($client->getResponse()->getContent(), true)['data']['id']);
    }

    /**
     * @return array{0: KernelBrowser, 1: string}
     */
    private function loginAs(RoleName $role, KernelBrowser $client): array
    {
        $user = UserFactory::new()->withRoles($role)->create();
        $user->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        return $this->login($user, $client);
    }

    /**
     * @return array{0: KernelBrowser, 1: string}
     */
    private function login(User $user, KernelBrowser $client): array
    {
        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => $user->getEmail(),
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
