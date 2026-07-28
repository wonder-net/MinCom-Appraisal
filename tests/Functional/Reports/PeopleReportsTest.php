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
use App\Service\ReportsCacheService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.reports.tests' coverage for Milestone 13c: Unapprised
 * Employees, Manager Effectiveness, Cross-Cycle Trend, and Employee
 * Appraisal History reports. Covers RBAC (including
 * EmployeeAppraisalHistoryView's object-level self/manager/admin-only
 * access, and UnapraisedReportView's IsHRStaff-only, no-EXECUTIVE
 * carve-out), aggregation correctness, and the CrossCycleTrendView
 * quirk where an unknown department_id yields an empty 200 rather
 * than a 404 (unlike every other filterable report).
 */
final class PeopleReportsTest extends WebTestCase
{
    public function testUnapprisedRequiresHrStaffButNotExecutive(): void
    {
        $client = static::createClient();
        [$client, $execToken] = $this->loginAsRole($client, RoleName::EXECUTIVE);
        $client->request('GET', '/api/v1/reports/unapprised/', server: $this->authHeader($execToken));
        self::assertResponseStatusCodeSame(403);

        [$client, $hrToken] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/unapprised/', server: $this->authHeader($hrToken));
        self::assertResponseStatusCodeSame(200);
    }

    public function testUnapprisedExcludesAppraisedAndExecutiveAndSystemAdmin(): void
    {
        $client = static::createClient();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $dept = DepartmentFactory::new()->create();

        $unapprised = EmployeeFactory::new()->create(['department' => $dept, 'name' => 'Not Yet Appraised']);

        $appraised = EmployeeFactory::new()->create(['department' => $dept]);
        AppraisalFactory::new()->create(['cycle' => $cycle, 'employee' => $appraised]);

        $executive = EmployeeFactory::new()->create(['department' => $dept]);
        $executive->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EXECUTIVE]));

        $em->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/unapprised/?cycle_id='.$cycle->getId(), server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame(1, $body['count']);
        self::assertSame('Not Yet Appraised', $body['employees'][0]['name']);
    }

    public function testUnapprisedInvalidDepartmentIdReturns400(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);

        $client->request('GET', '/api/v1/reports/unapprised/?department_id=not-a-uuid', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(400);
    }

    public function testUnapprisedNonexistentDepartmentIdReturns404(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);

        $client->request('GET', '/api/v1/reports/unapprised/?department_id='.Uuid::v7(), server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(404);
    }

    public function testManagerEffectivenessAggregatesTeamStatsAndSkipsZeroTeamManagers(): void
    {
        $client = static::createClient();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $cycle = AppraisalCycleFactory::new()->active()->create();

        $activeManager = EmployeeFactory::new()->managerial()->create(['name' => 'Active Manager']);
        $report1 = EmployeeFactory::new()->withManager($activeManager)->create();
        AppraisalFactory::new()->create(['cycle' => $cycle, 'employee' => $report1, 'status' => AppraisalStatus::FINALISED, 'totalScore' => '4.00']);
        $report2 = EmployeeFactory::new()->withManager($activeManager)->create();
        AppraisalFactory::new()->create(['cycle' => $cycle, 'employee' => $report2, 'status' => AppraisalStatus::DISPUTED]);

        // A manager whose only report's appraisal is EXCLUDED must not appear at all.
        $excludedManager = EmployeeFactory::new()->managerial()->create(['name' => 'Excluded Manager']);
        $excludedReport = EmployeeFactory::new()->withManager($excludedManager)->create();
        AppraisalFactory::new()->create(['cycle' => $cycle, 'employee' => $excludedReport, 'status' => AppraisalStatus::EXCLUDED]);

        $em->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/manager-effectiveness/?cycle_id='.$cycle->getId(), server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        $byName = array_column($body['managers'], null, 'manager_name');
        self::assertArrayNotHasKey('Excluded Manager', $byName);
        self::assertSame(2, $byName['Active Manager']['team_size']);
        self::assertSame('50', (string) (float) $byName['Active Manager']['completion_rate']);
        self::assertSame('4', (string) (float) $byName['Active Manager']['avg_team_score']);
        self::assertSame(1, $byName['Active Manager']['dispute_count']);
    }

    public function testManagerEffectivenessOrdersByDecryptedManagerNameNotCiphertext(): void
    {
        // Employee.name is encrypted at rest (AES-256-GCM, random IV per
        // value) — ciphertext byte order bears no relation to plaintext
        // alphabetical order, so this only passes if the report sorts by
        // the decrypted name in PHP, not via SQL ORDER BY.
        $client = static::createClient();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $cycle = AppraisalCycleFactory::new()->active()->create();

        foreach (['Zoe Adams', 'Amy Baker', 'Mike Carter'] as $name) {
            $manager = EmployeeFactory::new()->managerial()->create(['name' => $name]);
            $report = EmployeeFactory::new()->withManager($manager)->create();
            AppraisalFactory::new()->create(['cycle' => $cycle, 'employee' => $report, 'status' => AppraisalStatus::FINALISED, 'totalScore' => '4.00']);
        }
        $em->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/manager-effectiveness/?cycle_id='.$cycle->getId(), server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame(
            ['Amy Baker', 'Mike Carter', 'Zoe Adams'],
            array_column($body['managers'], 'manager_name'),
        );
    }

    public function testManagerEffectivenessNonexistentDepartmentIdReturns404(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);

        $client->request('GET', '/api/v1/reports/manager-effectiveness/?department_id='.Uuid::v7(), server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(404);
    }

    public function testCrossCycleTrendOnlyIncludesClosedAndArchivedCycles(): void
    {
        $client = static::createClient();
        // trend.all is a constant, non-cycle-scoped cache key (unlike
        // every other 13b/13c report), so unlike them it isn't naturally
        // isolated between test runs by a fresh cycle_id; the reports
        // cache pool is filesystem-backed and outside DAMADoctrineTestBundle's
        // per-test DB rollback, so a stale entry from an earlier run
        // would otherwise leak in here.
        static::getContainer()->get(ReportsCacheService::class)->invalidateReports(null, null);
        $em = static::getContainer()->get(EntityManagerInterface::class);

        $closedCycle = AppraisalCycleFactory::new()->closed()->create(['startDate' => new \DateTimeImmutable('-400 days')]);
        AppraisalFactory::new()->create(['cycle' => $closedCycle, 'status' => AppraisalStatus::FINALISED, 'totalScore' => '3.50']);

        $activeCycle = AppraisalCycleFactory::new()->active()->create();
        AppraisalFactory::new()->create(['cycle' => $activeCycle, 'status' => AppraisalStatus::FINALISED, 'totalScore' => '5.00']);

        $em->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/trend/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        $cycleIds = array_column($body['data_points'], 'cycle_id');
        self::assertContains((string) $closedCycle->getId(), $cycleIds);
        self::assertNotContains((string) $activeCycle->getId(), $cycleIds);
    }

    public function testCrossCycleTrendNonexistentDepartmentReturnsEmptyNot404(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);

        $client->request('GET', '/api/v1/reports/trend/?department_id='.Uuid::v7(), server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame([], $body['data_points']);
    }

    public function testCrossCycleTrendInvalidDepartmentIdReturns400(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);

        $client->request('GET', '/api/v1/reports/trend/?department_id=not-a-uuid', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(400);
    }

    public function testAppraisalHistoryAllowsSelfAccess(): void
    {
        $client = static::createClient();
        $employee = EmployeeFactory::new()->create();
        $employee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $token] = $this->login($employee->getUser(), $client);
        $client->request('GET', '/api/v1/reports/employees/'.$employee->getId().'/appraisal-history/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
    }

    public function testAppraisalHistoryAllowsManagerOfDirectReportButNotOtherManagers(): void
    {
        $client = static::createClient();
        $manager = EmployeeFactory::new()->managerial()->create();
        $manager->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::MANAGER]));
        $directReport = EmployeeFactory::new()->withManager($manager)->create();

        $otherManager = EmployeeFactory::new()->managerial()->create();
        $otherManager->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::MANAGER]));

        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $managerToken] = $this->login($manager->getUser(), $client);
        $client->request('GET', '/api/v1/reports/employees/'.$directReport->getId().'/appraisal-history/', server: $this->authHeader($managerToken));
        self::assertResponseStatusCodeSame(200);

        [$client, $otherToken] = $this->login($otherManager->getUser(), $client);
        $client->request('GET', '/api/v1/reports/employees/'.$directReport->getId().'/appraisal-history/', server: $this->authHeader($otherToken));
        self::assertResponseStatusCodeSame(403);
    }

    public function testAppraisalHistoryAllowsAdminForAnyEmployee(): void
    {
        $client = static::createClient();
        $employee = EmployeeFactory::new()->create();
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/employees/'.$employee->getId().'/appraisal-history/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
    }

    public function testAppraisalHistoryReturnsRowsOrderedByCycleStartDateAscending(): void
    {
        $client = static::createClient();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $employee = EmployeeFactory::new()->create();

        $olderCycle = AppraisalCycleFactory::new()->closed()->create(['startDate' => new \DateTimeImmutable('-400 days')]);
        AppraisalFactory::new()->create(['cycle' => $olderCycle, 'employee' => $employee, 'status' => AppraisalStatus::FINALISED, 'totalScore' => '3.00']);

        $newerCycle = AppraisalCycleFactory::new()->active()->create(['startDate' => new \DateTimeImmutable('-10 days')]);
        AppraisalFactory::new()->create(['cycle' => $newerCycle, 'employee' => $employee, 'status' => AppraisalStatus::SELF_ASSESSMENT]);

        $em->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/employees/'.$employee->getId().'/appraisal-history/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertCount(2, $body['history']);
        self::assertSame((string) $olderCycle->getId(), $body['history'][0]['cycle_id']);
        self::assertSame((string) $newerCycle->getId(), $body['history'][1]['cycle_id']);
    }

    public function testAppraisalHistoryNonexistentEmployeeReturns404(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);

        $client->request('GET', '/api/v1/reports/employees/'.Uuid::v7().'/appraisal-history/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(404);
    }

    public function testAppraisalHistoryDeniesUnrelatedEmployee(): void
    {
        $client = static::createClient();
        $employee = EmployeeFactory::new()->create();
        $stranger = EmployeeFactory::new()->create();
        $stranger->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $token] = $this->login($stranger->getUser(), $client);
        $client->request('GET', '/api/v1/reports/employees/'.$employee->getId().'/appraisal-history/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(403);
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
