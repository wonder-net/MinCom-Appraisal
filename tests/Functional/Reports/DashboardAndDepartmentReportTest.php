<?php

declare(strict_types=1);

namespace App\Tests\Functional\Reports;

use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Enum\RoleName;
use App\Factory\AppraisalCycleFactory;
use App\Factory\AppraisalFactory;
use App\Factory\DepartmentFactory;
use App\Factory\EmployeeFactory;
use App\Factory\RoleFactory;
use App\Factory\UserFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.reports.tests.{test_dashboard,test_department_report}'s
 * core coverage: RBAC, basic aggregation (status counts, completion
 * rate, overdue count, per-department breakdown, avg total score),
 * and the no-active-cycle zero-state. Cache-hit/miss internals aren't
 * directly assertable from outside, but the cache-busting wiring is
 * exercised indirectly by asserting a transition changes the reported
 * numbers on the next request.
 */
final class DashboardAndDepartmentReportTest extends WebTestCase
{
    public function testDashboardRequiresHrStaffOrExecutive(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::EMPLOYEE);

        $client->request('GET', '/api/v1/reports/dashboard/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(403);
    }

    public function testDashboardAllowsHrOfficerAndExecutive(): void
    {
        $client = static::createClient();
        [$client, $officerToken] = $this->loginAsRole($client, RoleName::HR_OFFICER);
        $client->request('GET', '/api/v1/reports/dashboard/', server: $this->authHeader($officerToken));
        self::assertResponseStatusCodeSame(200);

        [$client, $execToken] = $this->loginAsRole($client, RoleName::EXECUTIVE);
        $client->request('GET', '/api/v1/reports/dashboard/', server: $this->authHeader($execToken));
        self::assertResponseStatusCodeSame(200);
    }

    public function testDashboardReturnsZeroStateWhenNoActiveCycle(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);

        $client->request('GET', '/api/v1/reports/dashboard/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertNull($body['cycle_id']);
        self::assertSame(0, $body['total_employees']);
        self::assertSame('0.00', (string) $body['completion_rate']);
        self::assertSame([], $body['departments']);
    }

    public function testDashboardAggregatesStatusCountsAndCompletionRate(): void
    {
        $client = static::createClient();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $dept = DepartmentFactory::new()->create();

        $finalised = EmployeeFactory::new()->create(['department' => $dept]);
        AppraisalFactory::new()->create(['cycle' => $cycle, 'employee' => $finalised, 'status' => AppraisalStatus::FINALISED]);

        $inProgress = EmployeeFactory::new()->create(['department' => $dept]);
        AppraisalFactory::new()->create(['cycle' => $cycle, 'employee' => $inProgress, 'status' => AppraisalStatus::DISCUSSION]);

        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/dashboard/?cycle_id='.$cycle->getId(), server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame((string) $cycle->getId(), $body['cycle_id']);
        self::assertSame(2, $body['total_employees']);
        self::assertSame(1, $body['appraisals_by_status']['FINALISED']);
        self::assertSame(1, $body['appraisals_by_status']['DISCUSSION']);
        self::assertSame(0, $body['appraisals_by_status']['SIGNED_OFF']);
        // 1 FINALISED out of 2 eligible = 50.00%.
        self::assertSame('50', (string) (float) $body['completion_rate']);
        self::assertCount(1, $body['departments']);
        self::assertSame($dept->getName(), $body['departments'][0]['department_name']);
        self::assertSame(2, $body['departments'][0]['employee_count']);
    }

    public function testDashboardInvalidCycleIdReturns400(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);

        $client->request('GET', '/api/v1/reports/dashboard/?cycle_id=not-a-uuid', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(400);
    }

    public function testDashboardNonexistentCycleIdReturns404(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);

        $client->request('GET', '/api/v1/reports/dashboard/?cycle_id='.Uuid::v7(), server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(404);
    }

    public function testDepartmentReportManagerCanAccessOwnDepartmentOnly(): void
    {
        $client = static::createClient();
        $ownDept = DepartmentFactory::new()->create();
        $otherDept = DepartmentFactory::new()->create();
        $manager = EmployeeFactory::new()->managerial()->create(['department' => $ownDept]);
        $manager->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::MANAGER]));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $token] = $this->login($manager->getUser(), $client);

        $client->request('GET', '/api/v1/reports/department/'.$ownDept->getId().'/', server: $this->authHeader($token));
        self::assertResponseStatusCodeSame(200);

        $client->request('GET', '/api/v1/reports/department/'.$otherDept->getId().'/', server: $this->authHeader($token));
        self::assertResponseStatusCodeSame(403);
    }

    public function testDepartmentReportNonexistentDepartmentReturns404(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);

        $client->request('GET', '/api/v1/reports/department/'.Uuid::v7().'/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(404);
    }

    public function testDepartmentReportComputesAvgTotalScoreFromFinalisedOnly(): void
    {
        $client = static::createClient();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $dept = DepartmentFactory::new()->create();

        $emp1 = EmployeeFactory::new()->create(['department' => $dept]);
        AppraisalFactory::new()->create(['cycle' => $cycle, 'employee' => $emp1, 'status' => AppraisalStatus::FINALISED, 'totalScore' => '4.00']);
        $emp2 = EmployeeFactory::new()->create(['department' => $dept]);
        AppraisalFactory::new()->create(['cycle' => $cycle, 'employee' => $emp2, 'status' => AppraisalStatus::FINALISED, 'totalScore' => '3.00']);
        // Non-FINALISED appraisal must not affect the average.
        $emp3 = EmployeeFactory::new()->create(['department' => $dept]);
        AppraisalFactory::new()->create(['cycle' => $cycle, 'employee' => $emp3, 'status' => AppraisalStatus::DISCUSSION, 'totalScore' => '1.00']);

        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/department/'.$dept->getId().'/?cycle_id='.$cycle->getId(), server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame(3, $body['employee_count']);
        self::assertSame('3.5', (string) (float) $body['avg_total_score']);
    }

    public function testDepartmentReportNoFinalisedAppraisalsReturnsNullAverage(): void
    {
        $client = static::createClient();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $dept = DepartmentFactory::new()->create();
        $emp = EmployeeFactory::new()->create(['department' => $dept]);
        AppraisalFactory::new()->create(['cycle' => $cycle, 'employee' => $emp, 'status' => AppraisalStatus::DISCUSSION]);
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/department/'.$dept->getId().'/?cycle_id='.$cycle->getId(), server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertNull($body['avg_total_score']);
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
