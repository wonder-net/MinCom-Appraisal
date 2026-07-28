<?php

declare(strict_types=1);

namespace App\Tests\Functional\Appraisals;

use App\Entity\Appraisal;
use App\Entity\Employee;
use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Enum\RoleName;
use App\Factory\AppraisalCycleFactory;
use App\Factory\AppraisalFactory;
use App\Factory\EmployeeFactory;
use App\Factory\KeyDeliverableFactory;
use App\Factory\RoleFactory;
use App\Factory\UserFactory;
use App\Repository\AppraisalRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Port of apps.appraisals.tests.test_escalation.py's transition/RBAC/
 * version-conflict coverage, plus tests proving the Milestone 10d
 * backfill (AppraisalAccessChecker::isManagerOf, deriveSignerRole,
 * canUserRead, TransitionValidator) actually changes behaviour once an
 * appraisal is escalated. Notification/audit-log assertions are
 * intentionally omitted — those apps aren't ported yet.
 */
final class EscalationTest extends WebTestCase
{
    public function testEscalateDisputedMovesToDiscussion(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeDisputedAppraisal();
        $executive = $this->makeExecutiveUser();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/escalate/', server: $this->authHeader($token), content: json_encode([
            'executive_user_id' => (string) $executive->getId(),
            'reason' => 'Manager bias has been alleged by the appraisee.',
            'version' => $appraisal->getVersion(),
        ]));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('DISCUSSION', $body['status']);
        self::assertSame((string) $executive->getId(), $body['escalated_executive']);
        self::assertSame('Manager bias has been alleged by the appraisee.', $body['escalation_reason']);

        /** @var AppraisalRepository $appraisals */
        $appraisals = static::getContainer()->get(AppraisalRepository::class);
        $refreshed = $appraisals->findById((string) $appraisal->getId());
        self::assertSame(AppraisalStatus::DISCUSSION, $refreshed->getStatus());
    }

    public function testEscalateNonDisputedReturns400(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeDisputedAppraisal(AppraisalStatus::MANAGER_REVIEW);
        $executive = $this->makeExecutiveUser();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/escalate/', server: $this->authHeader($token), content: json_encode([
            'executive_user_id' => (string) $executive->getId(),
            'reason' => 'Some sufficiently long reason here.',
            'version' => $appraisal->getVersion(),
        ]));

        self::assertResponseStatusCodeSame(400);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertStringContainsString('not in DISPUTED status', (string) json_encode($body));
    }

    public function testReassignExecutivePreservesOriginalReason(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeDisputedAppraisal();
        $executive = $this->makeExecutiveUser();
        $otherExecutive = $this->makeExecutiveUser();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $originalReason = 'Initial escalation reason text recorded here.';
        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/escalate/', server: $this->authHeader($token), content: json_encode([
            'executive_user_id' => (string) $executive->getId(),
            'reason' => $originalReason,
            'version' => $appraisal->getVersion(),
        ]));
        self::assertResponseStatusCodeSame(200);
        $afterEscalate = json_decode($client->getResponse()->getContent(), true)['data'];

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/reassign-executive/', server: $this->authHeader($token), content: json_encode([
            'executive_user_id' => (string) $otherExecutive->getId(),
            'version' => $afterEscalate['version'],
        ]));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame((string) $otherExecutive->getId(), $body['escalated_executive']);
        self::assertSame($originalReason, $body['escalation_reason']);
    }

    public function testEscalateWhitespaceReasonRejected(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeDisputedAppraisal();
        $executive = $this->makeExecutiveUser();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/escalate/', server: $this->authHeader($token), content: json_encode([
            'executive_user_id' => (string) $executive->getId(),
            'reason' => str_repeat(' ', 10),
            'version' => $appraisal->getVersion(),
        ]));

        self::assertResponseStatusCodeSame(400);
    }

    public function testEscalateReasonExceedsMaxLengthRejected(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeDisputedAppraisal();
        $executive = $this->makeExecutiveUser();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/escalate/', server: $this->authHeader($token), content: json_encode([
            'executive_user_id' => (string) $executive->getId(),
            'reason' => str_repeat('x', 2001),
            'version' => $appraisal->getVersion(),
        ]));

        self::assertResponseStatusCodeSame(400);
    }

    public function testEscalateAlreadyEscalatedRejected(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeDisputedAppraisal();
        $executive = $this->makeExecutiveUser();
        $otherExecutive = $this->makeExecutiveUser();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/escalate/', server: $this->authHeader($token), content: json_encode([
            'executive_user_id' => (string) $executive->getId(),
            'reason' => 'First valid escalation reason supplied.',
            'version' => $appraisal->getVersion(),
        ]));
        self::assertResponseStatusCodeSame(200);
        $afterEscalate = json_decode($client->getResponse()->getContent(), true)['data'];

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/escalate/', server: $this->authHeader($token), content: json_encode([
            'executive_user_id' => (string) $otherExecutive->getId(),
            'reason' => 'Second escalation should be blocked entirely.',
            'version' => $afterEscalate['version'],
        ]));

        self::assertResponseStatusCodeSame(400);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertStringContainsString('already escalated', strtolower((string) json_encode($body)));
    }

    public function testReassignWithoutPriorEscalationRejected(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeDisputedAppraisal();
        $executive = $this->makeExecutiveUser();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/reassign-executive/', server: $this->authHeader($token), content: json_encode([
            'executive_user_id' => (string) $executive->getId(),
            'version' => $appraisal->getVersion(),
        ]));

        self::assertResponseStatusCodeSame(400);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertStringContainsString('has not been escalated', (string) json_encode($body));
    }

    public function testReassignSameExecutiveRejected(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeDisputedAppraisal();
        $executive = $this->makeExecutiveUser();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/escalate/', server: $this->authHeader($token), content: json_encode([
            'executive_user_id' => (string) $executive->getId(),
            'reason' => 'A perfectly valid escalation reason.',
            'version' => $appraisal->getVersion(),
        ]));
        self::assertResponseStatusCodeSame(200);
        $afterEscalate = json_decode($client->getResponse()->getContent(), true)['data'];

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/reassign-executive/', server: $this->authHeader($token), content: json_encode([
            'executive_user_id' => (string) $executive->getId(),
            'version' => $afterEscalate['version'],
        ]));

        self::assertResponseStatusCodeSame(400);
    }

    public function testEscalateInvalidExecutiveUserIdRejected(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeDisputedAppraisal();
        // A regular employee (not EXECUTIVE) cannot be escalated to.
        $notExecutive = UserFactory::new()->withRoles(RoleName::MANAGER)->create();
        static::getContainer()->get(EntityManagerInterface::class)->flush();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/escalate/', server: $this->authHeader($token), content: json_encode([
            'executive_user_id' => (string) $notExecutive->getId(),
            'reason' => 'A perfectly valid escalation reason.',
            'version' => $appraisal->getVersion(),
        ]));

        self::assertResponseStatusCodeSame(400);
    }

    public function testEscalateMissingExecutiveUserIdRejected(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeDisputedAppraisal();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/escalate/', server: $this->authHeader($token), content: json_encode([
            'reason' => 'A perfectly valid escalation reason.',
            'version' => $appraisal->getVersion(),
        ]));

        self::assertResponseStatusCodeSame(400);
    }

    public function testEscalateVersionConflictReturns409(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeDisputedAppraisal();
        $executive = $this->makeExecutiveUser();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/escalate/', server: $this->authHeader($token), content: json_encode([
            'executive_user_id' => (string) $executive->getId(),
            'reason' => 'Some sufficiently long escalation reason.',
            'version' => $appraisal->getVersion() - 1,
        ]));

        self::assertResponseStatusCodeSame(409);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertStringContainsString('correlation_id', (string) json_encode($body));
    }

    public function testReassignVersionConflictReturns409(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeDisputedAppraisal();
        $executive = $this->makeExecutiveUser();
        $otherExecutive = $this->makeExecutiveUser();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/escalate/', server: $this->authHeader($token), content: json_encode([
            'executive_user_id' => (string) $executive->getId(),
            'reason' => 'Some sufficiently long escalation reason.',
            'version' => $appraisal->getVersion(),
        ]));
        self::assertResponseStatusCodeSame(200);
        $afterEscalate = json_decode($client->getResponse()->getContent(), true)['data'];

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/reassign-executive/', server: $this->authHeader($token), content: json_encode([
            'executive_user_id' => (string) $otherExecutive->getId(),
            'version' => $afterEscalate['version'] - 1,
        ]));

        self::assertResponseStatusCodeSame(409);
    }

    public function testNonHrAdminRolesForbiddenFromEscalate(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeDisputedAppraisal();
        $executive = $this->makeExecutiveUser();

        // All non-admin users are created up front, before any
        // $client->request() call, since Foundry factory creation after
        // a kernel reboot (triggered by every request) is unproven in
        // this codebase — only entity re-fetch-by-id (via login()) is
        // established as reboot-safe.
        $roles = [RoleName::EMPLOYEE, RoleName::MANAGER, RoleName::EXECUTIVE, RoleName::HR_OFFICER];
        $userIds = [];
        foreach ($roles as $role) {
            $user = UserFactory::new()->withRoles($role)->create();
            $userIds[$role->value] = (string) $user->getId();
        }
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        foreach ($roles as $role) {
            $em = static::getContainer()->get(EntityManagerInterface::class);
            $user = $em->getRepository(User::class)->find($userIds[$role->value]);
            \assert($user instanceof User);
            [$client, $token] = $this->login($user, $client);

            $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/escalate/', server: $this->authHeader($token), content: json_encode([
                'executive_user_id' => (string) $executive->getId(),
                'reason' => 'Some long enough reason for escalation purposes.',
                'version' => $appraisal->getVersion(),
            ]));

            self::assertResponseStatusCodeSame(403, sprintf('Role %s should be forbidden from escalating.', $role->value));
        }
    }

    public function testNonHrAdminRolesForbiddenFromReassign(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeDisputedAppraisal();
        $executive = $this->makeExecutiveUser();

        $roles = [RoleName::EMPLOYEE, RoleName::MANAGER, RoleName::EXECUTIVE, RoleName::HR_OFFICER];
        $userIds = [];
        foreach ($roles as $role) {
            $user = UserFactory::new()->withRoles($role)->create();
            $userIds[$role->value] = (string) $user->getId();
        }
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        foreach ($roles as $role) {
            $em = static::getContainer()->get(EntityManagerInterface::class);
            $user = $em->getRepository(User::class)->find($userIds[$role->value]);
            \assert($user instanceof User);
            [$client, $token] = $this->login($user, $client);

            $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/reassign-executive/', server: $this->authHeader($token), content: json_encode([
                'executive_user_id' => (string) $executive->getId(),
                'version' => $appraisal->getVersion(),
            ]));

            self::assertResponseStatusCodeSame(403, sprintf('Role %s should be forbidden from reassigning.', $role->value));
        }
    }

    public function testEscalateResponseIncludesDetailOnlyFields(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeDisputedAppraisal();
        $executive = $this->makeExecutiveUser();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/escalate/', server: $this->authHeader($token), content: json_encode([
            'executive_user_id' => (string) $executive->getId(),
            'reason' => 'A perfectly valid escalation reason.',
            'version' => $appraisal->getVersion(),
        ]));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        foreach (['employee_name', 'cycle_period_name', 'appraiser_id', 'department', 'signatures', 'employee_id', 'employee_number', 'employee_job_title', 'self_rating_enabled'] as $field) {
            self::assertArrayHasKey($field, $body, sprintf('Detail field "%s" missing from escalate response.', $field));
        }
    }

    public function testEscalatedExecutiveCanRateKeyDeliverable(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeDisputedAppraisal();
        $executive = $this->makeExecutiveUser();
        $kd = KeyDeliverableFactory::new()->create(['appraisal' => $appraisal]);
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $hrToken] = $this->loginAsHrAdmin($client);
        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/escalate/', server: $this->authHeader($hrToken), content: json_encode([
            'executive_user_id' => (string) $executive->getId(),
            'reason' => 'A perfectly valid escalation reason.',
            'version' => $appraisal->getVersion(),
        ]));
        self::assertResponseStatusCodeSame(200);

        [$client, $execToken] = $this->login($executive, $client);
        $client->request('PATCH', '/api/v1/appraisals/'.$appraisal->getId().'/deliverables/'.$kd->getId().'/', server: $this->authHeader($execToken), content: json_encode([
            'manager_rating' => 4.0,
        ]));

        self::assertResponseStatusCodeSame(200);
    }

    public function testOriginalManagerCannotRateKeyDeliverableAfterEscalation(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal, 'managerEmployee' => $managerEmployee] = $this->makeDisputedAppraisal();
        $executive = $this->makeExecutiveUser();
        $kd = KeyDeliverableFactory::new()->create(['appraisal' => $appraisal]);
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $hrToken] = $this->loginAsHrAdmin($client);
        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/escalate/', server: $this->authHeader($hrToken), content: json_encode([
            'executive_user_id' => (string) $executive->getId(),
            'reason' => 'A perfectly valid escalation reason.',
            'version' => $appraisal->getVersion(),
        ]));
        self::assertResponseStatusCodeSame(200);

        $managerUserId = (string) $managerEmployee->getUser()->getId();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $managerUser = $em->getRepository(User::class)->find($managerUserId);
        \assert($managerUser instanceof User);
        [$client, $managerToken] = $this->login($managerUser, $client);

        $client->request('PATCH', '/api/v1/appraisals/'.$appraisal->getId().'/deliverables/'.$kd->getId().'/', server: $this->authHeader($managerToken), content: json_encode([
            'manager_rating' => 4.0,
        ]));

        self::assertResponseStatusCodeSame(403);
    }

    public function testOriginalManagerRetainsReadAccessAfterEscalation(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal, 'managerEmployee' => $managerEmployee] = $this->makeDisputedAppraisal();
        $executive = $this->makeExecutiveUser();

        [$client, $hrToken] = $this->loginAsHrAdmin($client);
        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/escalate/', server: $this->authHeader($hrToken), content: json_encode([
            'executive_user_id' => (string) $executive->getId(),
            'reason' => 'A perfectly valid escalation reason.',
            'version' => $appraisal->getVersion(),
        ]));
        self::assertResponseStatusCodeSame(200);

        $managerUserId = (string) $managerEmployee->getUser()->getId();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $managerUser = $em->getRepository(User::class)->find($managerUserId);
        \assert($managerUser instanceof User);
        [$client, $managerToken] = $this->login($managerUser, $client);

        $client->request('GET', '/api/v1/appraisals/'.$appraisal->getId().'/', server: $this->authHeader($managerToken));

        self::assertResponseStatusCodeSame(200);
    }

    /**
     * @return array{appraisal: Appraisal, managerEmployee: Employee}
     */
    private function makeDisputedAppraisal(AppraisalStatus $status = AppraisalStatus::DISPUTED): array
    {
        $managerEmployee = EmployeeFactory::new()->managerial()->create();
        $managerEmployee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::MANAGER]));

        $employee = EmployeeFactory::new()->withManager($managerEmployee)->create();
        $employee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));

        $cycle = AppraisalCycleFactory::new()->active()->create();

        $appraisal = AppraisalFactory::new()->create([
            'cycle' => $cycle,
            'employee' => $employee,
            'status' => $status,
        ]);

        static::getContainer()->get(EntityManagerInterface::class)->flush();

        return ['appraisal' => $appraisal, 'managerEmployee' => $managerEmployee];
    }

    private function makeExecutiveUser(): User
    {
        $user = UserFactory::new()->withRoles(RoleName::EXECUTIVE)->create();
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        return $user;
    }

    /**
     * @return array{0: KernelBrowser, 1: string}
     */
    private function loginAsHrAdmin(KernelBrowser $client): array
    {
        $user = UserFactory::new()->withRoles(RoleName::HR_ADMIN)->create();
        $user->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        return $this->login($user, $client);
    }

    /**
     * Re-fetches by id via the *current* container's EntityManager before
     * mutating — safe regardless of whether $user was loaded/created
     * through an earlier (possibly kernel-rebooted, now-stale) container.
     *
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
