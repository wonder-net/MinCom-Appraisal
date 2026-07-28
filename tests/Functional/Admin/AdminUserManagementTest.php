<?php

declare(strict_types=1);

namespace App\Tests\Functional\Admin;

use App\Enum\RoleName;
use App\Factory\EmployeeFactory;
use App\Factory\RoleFactory;
use App\Factory\UserFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class AdminUserManagementTest extends WebTestCase
{
    public function testNonAdminCannotListUsers(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::EMPLOYEE);

        $client->request('GET', '/api/v1/admin/users/', server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(403);
        self::assertSame('PERMISSION_DENIED', json_decode($client->getResponse()->getContent(), true)['data']['code']);
    }

    public function testAdminCanListUsersWithPagination(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);

        for ($i = 0; $i < 3; ++$i) {
            UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        }

        $client->request('GET', '/api/v1/admin/users/?page_size=2', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true);

        self::assertSame('success', $body['status']);
        self::assertIsArray($body['data']);
        self::assertCount(2, $body['data']);
        self::assertGreaterThanOrEqual(4, $body['meta']['pagination']['count']); // 3 + the admin itself
        self::assertSame(2, $body['meta']['pagination']['page_size']);
        self::assertNotNull($body['meta']['pagination']['next']);
        self::assertNull($body['meta']['pagination']['previous']);

        $first = $body['data'][0];
        self::assertArrayHasKey('id', $first);
        self::assertArrayHasKey('email', $first);
        self::assertArrayHasKey('roles', $first);
        self::assertArrayHasKey('is_active', $first);
        self::assertArrayHasKey('mfa_enabled', $first);
        self::assertArrayHasKey('must_change_password', $first);
        self::assertArrayHasKey('is_locked', $first);
        self::assertNull($first['employee_id']);
    }

    public function testAdminUserListIncludesLinkedEmployeeProfileFields(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $manager = EmployeeFactory::new()->managerial()->create(['name' => 'Manager Name']);
        $employee = EmployeeFactory::new()->withManager($manager)->create(['name' => 'Jane Doe', 'jobTitle' => 'Engineer']);
        $employee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        $client->request('GET', '/api/v1/admin/users/?search='.urlencode($employee->getUser()->getEmail()), server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $row = json_decode($client->getResponse()->getContent(), true)['data'][0];

        self::assertSame((string) $employee->getId(), $row['employee_id']);
        self::assertSame('Jane Doe', $row['employee_name']);
        self::assertSame('Jane Doe', $row['full_name']);
        self::assertSame($employee->getEmployeeNumber(), $row['employee_number']);
        self::assertSame('Engineer', $row['job_title']);
        self::assertSame((string) $employee->getDepartment()->getId(), $row['department_id']);
        self::assertSame($employee->getDepartment()->getName(), $row['department_name']);
        self::assertSame('NON_MANAGERIAL', $row['classification']);
        self::assertSame((string) $manager->getId(), $row['manager_id']);
        self::assertSame('Manager Name', $row['manager_name']);
    }

    public function testAdminSearchFiltersByEmail(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $target = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();

        $client->request('GET', '/api/v1/admin/users/?search='.urlencode($target->getEmail()), server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true);

        self::assertCount(1, $body['data']);
        self::assertSame($target->getEmail(), $body['data'][0]['email']);
    }

    public function testAdminCreateUser(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);

        $client->request('POST', '/api/v1/admin/users/', server: $this->authHeader($accessToken), content: json_encode([
            'email' => 'new.hire@example.com',
            'full_name' => 'New Hire',
            'roles' => ['EMPLOYEE', 'MANAGER'],
        ]));

        self::assertResponseStatusCodeSame(201);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('new.hire@example.com', $body['email']);
        self::assertSame('New Hire', $body['full_name']);
        self::assertSame(['EMPLOYEE', 'MANAGER'], $body['roles']);
        self::assertTrue($body['is_active']);
        self::assertTrue($body['must_change_password']);
        self::assertNotEmpty($body['id']);
    }

    public function testAdminCreateUserRejectsDuplicateEmail(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $existing = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();

        $client->request('POST', '/api/v1/admin/users/', server: $this->authHeader($accessToken), content: json_encode([
            'email' => $existing->getEmail(),
            'full_name' => 'Duplicate',
            'roles' => ['EMPLOYEE'],
        ]));

        self::assertResponseStatusCodeSame(409);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertSame('CONFLICT', $body['data']['code']);
    }

    public function testAdminCreateUserValidatesRequiredFields(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);

        $client->request('POST', '/api/v1/admin/users/', server: $this->authHeader($accessToken), content: json_encode([
            'email' => '',
            'full_name' => '',
            'roles' => [],
        ]));

        self::assertResponseStatusCodeSame(400);
        $body = json_decode($client->getResponse()->getContent(), true);
        $fields = array_column($body['data']['errors'], 'field');
        self::assertContains('email', $fields);
        self::assertContains('full_name', $fields);
        self::assertContains('roles', $fields);
    }

    public function testAdminUpdateUserRoles(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $target = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();

        $client->request('PATCH', '/api/v1/admin/users/'.$target->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'roles' => ['MANAGER'],
            'full_name' => 'Updated Name',
        ]));

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame(['MANAGER'], $body['roles']);
        self::assertSame('Updated Name', $body['full_name']);
    }

    public function testAdminCreateUserWithEmployeeProfileByDepartmentId(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $department = \App\Factory\DepartmentFactory::new()->create();
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        $client->request('POST', '/api/v1/admin/users/', server: $this->authHeader($accessToken), content: json_encode([
            'email' => 'new.employee@example.com',
            'full_name' => 'New Employee',
            'roles' => ['EMPLOYEE'],
            'employee_number' => 'EMP-9001',
            'job_title' => 'Engineer',
            'department_id' => (string) $department->getId(),
            'classification' => 'NON_MANAGERIAL',
        ]));

        self::assertResponseStatusCodeSame(201);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('EMP9001', $body['employee_number']);
        self::assertSame('Engineer', $body['job_title']);
        self::assertSame((string) $department->getId(), $body['department_id']);
        self::assertSame('NON_MANAGERIAL', $body['classification']);
        self::assertNotNull($body['employee_id']);
    }

    public function testAdminCreateUserWithEmployeeProfileByDepartmentName(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);

        $client->request('POST', '/api/v1/admin/users/', server: $this->authHeader($accessToken), content: json_encode([
            'email' => 'name.dept@example.com',
            'full_name' => 'Name Dept',
            'roles' => ['EMPLOYEE'],
            'employee_number' => 'EMP-9002',
            'job_title' => 'Analyst',
            'department_name' => 'Brand New Department',
            'classification' => 'NON_MANAGERIAL',
        ]));

        self::assertResponseStatusCodeSame(201);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('Brand New Department', $body['department_name']);
    }

    public function testAdminCreateUserWithEmployeeProfileAndManager(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $manager = EmployeeFactory::new()->managerial()->create();
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        $client->request('POST', '/api/v1/admin/users/', server: $this->authHeader($accessToken), content: json_encode([
            'email' => 'reportee@example.com',
            'full_name' => 'Reportee',
            'roles' => ['EMPLOYEE'],
            'employee_number' => 'EMP-9003',
            'job_title' => 'Engineer',
            'department_id' => (string) $manager->getDepartment()->getId(),
            'classification' => 'NON_MANAGERIAL',
            'manager_id' => (string) $manager->getId(),
        ]));

        self::assertResponseStatusCodeSame(201);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame((string) $manager->getId(), $body['manager_id']);
    }

    public function testAdminCreateUserWithEmployeeNumberMissingRequiredFieldsReturns400(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);

        $client->request('POST', '/api/v1/admin/users/', server: $this->authHeader($accessToken), content: json_encode([
            'email' => 'incomplete@example.com',
            'full_name' => 'Incomplete',
            'roles' => ['EMPLOYEE'],
            'employee_number' => 'EMP-9004',
        ]));

        self::assertResponseStatusCodeSame(400);
        $fields = array_column(json_decode($client->getResponse()->getContent(), true)['data']['errors'], 'field');
        self::assertContains('job_title', $fields);
        self::assertContains('classification', $fields);
        self::assertContains('department_id', $fields);
    }

    public function testAdminCreateUserWithDuplicateEmployeeNumberReturns400(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $existing = EmployeeFactory::new()->create();
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        $client->request('POST', '/api/v1/admin/users/', server: $this->authHeader($accessToken), content: json_encode([
            'email' => 'dupe.number@example.com',
            'full_name' => 'Dupe Number',
            'roles' => ['EMPLOYEE'],
            'employee_number' => $existing->getEmployeeNumber(),
            'job_title' => 'Engineer',
            'department_id' => (string) $existing->getDepartment()->getId(),
            'classification' => 'NON_MANAGERIAL',
        ]));

        self::assertResponseStatusCodeSame(400);
        self::assertSame('Employee number already exists.', json_decode($client->getResponse()->getContent(), true)['data']['message']);
    }

    public function testAdminCreateUserWithNonExistentDepartmentIdReturns400(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);

        $client->request('POST', '/api/v1/admin/users/', server: $this->authHeader($accessToken), content: json_encode([
            'email' => 'bad.dept@example.com',
            'full_name' => 'Bad Dept',
            'roles' => ['EMPLOYEE'],
            'employee_number' => 'EMP-9005',
            'job_title' => 'Engineer',
            'department_id' => $this->randomUuid(),
            'classification' => 'NON_MANAGERIAL',
        ]));

        self::assertResponseStatusCodeSame(400);
        self::assertStringContainsString('does not exist', json_decode($client->getResponse()->getContent(), true)['data']['message']);
    }

    public function testAdminUpdateUserAddsEmployeeProfileFields(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $department = \App\Factory\DepartmentFactory::new()->create();
        $employee = EmployeeFactory::new()->create(['department' => $department, 'jobTitle' => 'Old Title']);
        $employee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        $client->request('PATCH', '/api/v1/admin/users/'.$employee->getUser()->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'job_title' => 'New Title',
            'location' => 'Remote',
        ]));

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('New Title', $body['job_title']);
        self::assertSame('Remote', $body['location']);
        // Untouched fields keep their prior value, not wiped by the patch.
        self::assertSame($employee->getEmployeeNumber(), $body['employee_number']);
        self::assertSame((string) $department->getId(), $body['department_id']);
    }

    public function testAdminUpdateUserSwitchesDepartmentByName(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $employee = EmployeeFactory::new()->create();
        $employee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        $client->request('PATCH', '/api/v1/admin/users/'.$employee->getUser()->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'department_name' => 'Freshly Named Dept',
        ]));

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('Freshly Named Dept', $body['department_name']);
    }

    public function testAdminUpdateUserClearsManager(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $manager = EmployeeFactory::new()->managerial()->create();
        $employee = EmployeeFactory::new()->withManager($manager)->create();
        $employee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        $client->request('PATCH', '/api/v1/admin/users/'.$employee->getUser()->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'manager_id' => null,
        ]));

        self::assertResponseIsSuccessful();
        self::assertNull(json_decode($client->getResponse()->getContent(), true)['data']['manager_id']);
    }

    public function testAdminUpdateUserWithoutManagerKeyLeavesManagerUnchanged(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $manager = EmployeeFactory::new()->managerial()->create();
        $employee = EmployeeFactory::new()->withManager($manager)->create();
        $employee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        $client->request('PATCH', '/api/v1/admin/users/'.$employee->getUser()->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'job_title' => 'Whatever',
        ]));

        self::assertResponseIsSuccessful();
        self::assertSame((string) $manager->getId(), json_decode($client->getResponse()->getContent(), true)['data']['manager_id']);
    }

    public function testAdminUpdateUserWithDuplicateEmployeeNumberReturns400(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $other = EmployeeFactory::new()->create();
        $employee = EmployeeFactory::new()->create();
        $employee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        $client->request('PATCH', '/api/v1/admin/users/'.$employee->getUser()->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'employee_number' => $other->getEmployeeNumber(),
        ]));

        self::assertResponseStatusCodeSame(400);
        self::assertSame('Employee number already exists.', json_decode($client->getResponse()->getContent(), true)['data']['message']);
    }

    public function testAdminUpdateUserKeepingOwnEmployeeNumberIsNotAConflict(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $employee = EmployeeFactory::new()->create();
        $employee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        $client->request('PATCH', '/api/v1/admin/users/'.$employee->getUser()->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'employee_number' => $employee->getEmployeeNumber(),
        ]));

        self::assertResponseIsSuccessful();
    }

    public function testAdminUpdateUserWithoutEmployeeProfileIgnoresEmployeeFields(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $target = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();

        $client->request('PATCH', '/api/v1/admin/users/'.$target->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'job_title' => 'Should Be Ignored',
        ]));

        self::assertResponseIsSuccessful();
        self::assertNull(json_decode($client->getResponse()->getContent(), true)['data']['employee_id']);
    }

    public function testAdminUpdateUserFullNameSyncsToEmployeeName(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $employee = EmployeeFactory::new()->create(['name' => 'Old Name']);
        $employee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        $client->request('PATCH', '/api/v1/admin/users/'.$employee->getUser()->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'full_name' => 'New Name',
        ]));

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('New Name', $body['full_name']);
        self::assertSame('New Name', $body['employee_name']);
    }

    public function testAdminDeactivatingUserRevokesTokens(): void
    {
        $client = static::createClient();
        $admin = UserFactory::new()->withRoles(RoleName::HR_ADMIN)->create();
        $admin->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        $target = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        // Target logs in for real, establishing a refresh token to revoke.
        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => $target->getEmail(),
            'password' => UserFactory::DEFAULT_PASSWORD,
        ]));
        $targetLogin = json_decode($client->getResponse()->getContent(), true)['data'];

        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => $admin->getEmail(),
            'password' => UserFactory::DEFAULT_PASSWORD,
        ]));
        $accessToken = json_decode($client->getResponse()->getContent(), true)['data']['access'];

        $client->request('PATCH', '/api/v1/admin/users/'.$target->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'is_active' => false,
        ]));
        self::assertResponseIsSuccessful();
        self::assertFalse(json_decode($client->getResponse()->getContent(), true)['data']['is_active']);

        $client->request('POST', '/api/v1/auth/token/refresh/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'refresh' => $targetLogin['refresh'],
        ]));
        self::assertResponseStatusCodeSame(401);
    }

    public function testAdminUpdateUserNotFound(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);

        $client->request('PATCH', '/api/v1/admin/users/'.$this->randomUuid().'/', server: $this->authHeader($accessToken), content: json_encode(['full_name' => 'X']));
        self::assertResponseStatusCodeSame(404);
    }

    public function testResendInvitation(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $target = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create(); // lastPasswordChange still null

        $client->request('POST', '/api/v1/admin/users/'.$target->getId().'/resend-invitation/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        self::assertSame('Invitation email resent.', json_decode($client->getResponse()->getContent(), true)['data']['message']);
    }

    public function testResendInvitationRejectedWhenAlreadyRotated(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $target = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        $target->setLastPasswordChange(new \DateTimeImmutable('-1 day'));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        $client->request('POST', '/api/v1/admin/users/'.$target->getId().'/resend-invitation/', server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(409);
        self::assertSame('INVITATION_ALREADY_USED', json_decode($client->getResponse()->getContent(), true)['data']['code']);
    }

    public function testAdminMfaResetGuards(): void
    {
        [$client, $accessToken, $admin] = $this->loginAs(RoleName::HR_ADMIN);
        $target = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();

        // Self-reset guard.
        $client->request('POST', '/api/v1/admin/users/'.$admin->getId().'/reset-mfa/', server: $this->authHeader($accessToken), content: json_encode(['password' => UserFactory::DEFAULT_PASSWORD]));
        self::assertResponseStatusCodeSame(400);
        self::assertSame('SELF_RESET_NOT_ALLOWED', json_decode($client->getResponse()->getContent(), true)['data']['code']);

        // Wrong admin password.
        $client->request('POST', '/api/v1/admin/users/'.$target->getId().'/reset-mfa/', server: $this->authHeader($accessToken), content: json_encode(['password' => 'wrong']));
        self::assertResponseStatusCodeSame(400);
        self::assertSame('INVALID_PASSWORD', json_decode($client->getResponse()->getContent(), true)['data']['code']);

        // Target has no MFA enabled.
        $client->request('POST', '/api/v1/admin/users/'.$target->getId().'/reset-mfa/', server: $this->authHeader($accessToken), content: json_encode(['password' => UserFactory::DEFAULT_PASSWORD]));
        self::assertResponseStatusCodeSame(400);
        self::assertSame('MFA_NOT_ENABLED', json_decode($client->getResponse()->getContent(), true)['data']['code']);
    }

    public function testAdminUnlockUserGuards(): void
    {
        [$client, $accessToken, $admin] = $this->loginAs(RoleName::HR_ADMIN);
        $target = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();

        $client->request('POST', '/api/v1/admin/users/'.$admin->getId().'/unlock/', server: $this->authHeader($accessToken), content: json_encode(['password' => UserFactory::DEFAULT_PASSWORD]));
        self::assertResponseStatusCodeSame(400);
        self::assertSame('SELF_UNLOCK_NOT_ALLOWED', json_decode($client->getResponse()->getContent(), true)['data']['code']);

        $client->request('POST', '/api/v1/admin/users/'.$target->getId().'/unlock/', server: $this->authHeader($accessToken), content: json_encode(['password' => 'wrong']));
        self::assertResponseStatusCodeSame(400);
        self::assertSame('INVALID_PASSWORD', json_decode($client->getResponse()->getContent(), true)['data']['code']);

        // Target isn't locked.
        $client->request('POST', '/api/v1/admin/users/'.$target->getId().'/unlock/', server: $this->authHeader($accessToken), content: json_encode(['password' => UserFactory::DEFAULT_PASSWORD]));
        self::assertResponseStatusCodeSame(400);
        self::assertSame('NOT_LOCKED', json_decode($client->getResponse()->getContent(), true)['data']['code']);
    }

    /**
     * @return array{0: KernelBrowser, 1: string, 2: \App\Entity\User}
     */
    private function loginAs(RoleName $role): array
    {
        $client = static::createClient();
        $user = UserFactory::new()->withRoles($role)->create();
        $user->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => $user->getEmail(),
            'password' => UserFactory::DEFAULT_PASSWORD,
        ]));
        $login = json_decode($client->getResponse()->getContent(), true)['data'];

        return [$client, $login['access'], $user];
    }

    /**
     * @return array<string, string>
     */
    private function authHeader(string $accessToken): array
    {
        return ['CONTENT_TYPE' => 'application/json', 'HTTP_AUTHORIZATION' => 'Bearer '.$accessToken];
    }

    private function randomUuid(): string
    {
        return \Symfony\Component\Uid\Uuid::v4()->toRfc4122();
    }
}
