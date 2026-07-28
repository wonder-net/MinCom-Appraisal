<?php

declare(strict_types=1);

namespace App\Tests\Functional\Employees;

use App\Entity\User;
use App\Enum\RoleName;
use App\Factory\DepartmentFactory;
use App\Factory\EmployeeFactory;
use App\Factory\RoleFactory;
use App\Factory\UserFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class EmployeeApiTest extends WebTestCase
{
    public function testEmployeeSeesOnlyOwnRecordInList(): void
    {
        $client = static::createClient();
        [$client, $accessToken] = $this->loginAsEmployeeWithProfile($client);
        EmployeeFactory::new()->create(); // an unrelated employee

        $client->request('GET', '/api/v1/employees/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true);

        self::assertCount(1, $body['data']);
        self::assertSame(1, $body['meta']['pagination']['count']);
    }

    public function testManagerSeesSelfAndDirectReports(): void
    {
        $client = static::createClient();
        $manager = EmployeeFactory::new()->managerial()->create();
        EmployeeFactory::new()->withManager($manager)->create();
        EmployeeFactory::new()->withManager($manager)->create();
        EmployeeFactory::new()->create(); // unrelated employee, not visible

        $manager->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::MANAGER]));
        $manager->getUser()->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $accessToken] = $this->login($manager->getUser(), $client);

        $client->request('GET', '/api/v1/employees/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true);

        self::assertSame(3, $body['meta']['pagination']['count']); // self + 2 direct reports
    }

    public function testHrAdminSeesAllActiveEmployeesOrgWide(): void
    {
        $client = static::createClient();
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);
        EmployeeFactory::new()->create();
        EmployeeFactory::new()->create();
        EmployeeFactory::new()->inactive()->create(); // must not appear

        $client->request('GET', '/api/v1/employees/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true);

        self::assertSame(2, $body['meta']['pagination']['count']);
    }

    public function testListRejectsSearchTermOver100Chars(): void
    {
        $client = static::createClient();
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('GET', '/api/v1/employees/?search='.str_repeat('a', 101), server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(400);
    }

    public function testListSearchFiltersByEmployeeNumber(): void
    {
        $client = static::createClient();
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);
        $target = EmployeeFactory::new()->create(['employeeNumber' => 'EMP-77001']);
        EmployeeFactory::new()->create(['employeeNumber' => 'EMP-99002']);

        $client->request('GET', '/api/v1/employees/?search=77001', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true);

        self::assertCount(1, $body['data']);
        self::assertSame($target->getEmployeeNumber(), $body['data'][0]['employee_number']);
    }

    public function testDetailVisibleToSelf(): void
    {
        $client = static::createClient();
        $employee = EmployeeFactory::new()->create();
        $employee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));
        $employee->getUser()->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $accessToken] = $this->login($employee->getUser(), $client);

        $client->request('GET', '/api/v1/employees/'.$employee->getId().'/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];

        self::assertSame((string) $employee->getId(), $body['id']);
        self::assertArrayNotHasKey('user_detail', $body);
    }

    public function testDetailNotFoundForUnrelatedEmployee(): void
    {
        $client = static::createClient();
        [$client, $accessToken] = $this->loginAsEmployeeWithProfile($client);
        $other = EmployeeFactory::new()->create();

        $client->request('GET', '/api/v1/employees/'.$other->getId().'/', server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(404);
    }

    public function testDetailIncludesUserDetailForAdmin(): void
    {
        $client = static::createClient();
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);
        $employee = EmployeeFactory::new()->create();

        $client->request('GET', '/api/v1/employees/'.$employee->getId().'/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];

        self::assertArrayHasKey('user_detail', $body);
        self::assertSame($employee->getUser()->getEmail(), $body['user_detail']['email']);
    }

    public function testMeReturnsOwnProfile(): void
    {
        $client = static::createClient();
        $employee = EmployeeFactory::new()->create();
        $employee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));
        $employee->getUser()->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $accessToken] = $this->login($employee->getUser(), $client);

        $client->request('GET', '/api/v1/employees/me/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        self::assertSame((string) $employee->getId(), json_decode($client->getResponse()->getContent(), true)['data']['id']);
    }

    public function testMeReturns404WithoutLinkedProfile(): void
    {
        $client = static::createClient();
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('GET', '/api/v1/employees/me/', server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(404);
    }

    public function testManagerCanViewOwnDirectReports(): void
    {
        $client = static::createClient();
        $manager = EmployeeFactory::new()->managerial()->create();
        $report = EmployeeFactory::new()->withManager($manager)->create();
        $manager->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::MANAGER]));
        $manager->getUser()->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $accessToken] = $this->login($manager->getUser(), $client);

        $client->request('GET', '/api/v1/employees/'.$manager->getId().'/direct-reports/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true);

        self::assertSame(1, $body['meta']['pagination']['count']);
        self::assertSame((string) $report->getId(), $body['data'][0]['id']);
    }

    public function testManagerCannotViewSomeoneElsesDirectReports(): void
    {
        $client = static::createClient();
        $manager = EmployeeFactory::new()->managerial()->create();
        $otherManager = EmployeeFactory::new()->managerial()->create();
        $manager->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::MANAGER]));
        $manager->getUser()->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $accessToken] = $this->login($manager->getUser(), $client);

        $client->request('GET', '/api/v1/employees/'.$otherManager->getId().'/direct-reports/', server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(403);
    }

    public function testAdminCanViewAnyonesDirectReports(): void
    {
        $client = static::createClient();
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);
        $manager = EmployeeFactory::new()->managerial()->create();
        EmployeeFactory::new()->withManager($manager)->create();

        $client->request('GET', '/api/v1/employees/'.$manager->getId().'/direct-reports/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        self::assertSame(1, json_decode($client->getResponse()->getContent(), true)['meta']['pagination']['count']);
    }

    public function testNonAdminCannotListDepartments(): void
    {
        $client = static::createClient();
        [$client, $accessToken] = $this->loginAsEmployeeWithProfile($client);

        $client->request('GET', '/api/v1/employees/departments/', server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(403);
    }

    public function testAdminListsDepartmentsSortedByName(): void
    {
        $client = static::createClient();
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);
        DepartmentFactory::new()->create(['name' => 'Zeta Team']);
        DepartmentFactory::new()->create(['name' => 'Alpha Team']);

        $client->request('GET', '/api/v1/employees/departments/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];

        $names = array_column($body, 'name');
        $sorted = $names;
        sort($sorted, SORT_STRING | SORT_FLAG_CASE);
        self::assertSame($sorted, $names);
        self::assertContains('Zeta Team', $names);
        self::assertContains('Alpha Team', $names);
    }

    public function testAdminListsDistinctLocationsAndJobFamilies(): void
    {
        $client = static::createClient();
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);
        EmployeeFactory::new()->create(['location' => 'Accra', 'jobFamily' => 'Engineering']);
        EmployeeFactory::new()->create(['location' => 'Accra', 'jobFamily' => 'Finance']);
        EmployeeFactory::new()->create(['location' => '', 'jobFamily' => '']);

        $client->request('GET', '/api/v1/employees/locations/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        self::assertSame(['Accra'], json_decode($client->getResponse()->getContent(), true)['data']);

        $client->request('GET', '/api/v1/employees/job-families/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $families = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame(['Engineering', 'Finance'], $families);
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
    private function loginAsEmployeeWithProfile(KernelBrowser $client): array
    {
        $employee = EmployeeFactory::new()->create();
        $employee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));
        $employee->getUser()->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        return $this->login($employee->getUser(), $client);
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
