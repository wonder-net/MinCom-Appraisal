<?php

declare(strict_types=1);

namespace App\Tests\Functional\Audit;

use App\Entity\User;
use App\Enum\RoleName;
use App\Factory\UserFactory;
use App\Service\AuditService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.audit.tests.{test_views, test_hr_officer_access}'s
 * coverage of the audit log API: RBAC (HR staff only — HR_OFFICER
 * included per TASK-258, no EXECUTIVE), response shape and user_email
 * resolution (including the deleted-user-survives-audit-entry
 * guarantee), query-param filtering, the resource-scoped endpoint's
 * input validation, and forward/backward cursor pagination.
 */
final class AuditLogEndpointsTest extends WebTestCase
{
    private const AUDIT_LOGS_URL = '/api/v1/audit/logs/';

    public function testHrAdminAndHrOfficerGet200ButOthersGet403(): void
    {
        $client = static::createClient();
        $this->seedEntry($client);

        foreach ([RoleName::HR_ADMIN, RoleName::HR_OFFICER] as $role) {
            [$client, $token] = $this->loginAsRole($client, $role);
            $client->request('GET', self::AUDIT_LOGS_URL, server: $this->authHeader($token));
            self::assertResponseStatusCodeSame(200, $role->value.' should be allowed');
        }

        foreach ([RoleName::EMPLOYEE, RoleName::MANAGER, RoleName::EXECUTIVE] as $role) {
            [$client, $token] = $this->loginAsRole($client, $role);
            $client->request('GET', self::AUDIT_LOGS_URL, server: $this->authHeader($token));
            self::assertResponseStatusCodeSame(403, $role->value.' should be denied');
        }
    }

    public function testAnonymousIsDenied(): void
    {
        $client = static::createClient();
        $client->request('GET', self::AUDIT_LOGS_URL, server: ['CONTENT_TYPE' => 'application/json']);

        self::assertContains($client->getResponse()->getStatusCode(), [401, 403]);
    }

    public function testResourceScopedEndpointRequiresHrStaff(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::EMPLOYEE);

        $client->request('GET', '/api/v1/audit/logs/Appraisal/'.Uuid::v7().'/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(403);
    }

    public function testEntryContainsExpectedFields(): void
    {
        $client = static::createClient();
        $resourceId = Uuid::v7();
        $actor = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        static::getContainer()->get(AuditService::class)->log(
            'field.test',
            'User',
            $resourceId,
            $actor,
            null,
            null,
            '10.0.0.1',
            ['key' => 'value'],
        );

        // The login helper's own POST /auth/login/ now creates a real
        // "user.login" audit entry too (since LoginController is wired
        // up) — filter by action to isolate the entry this test cares
        // about, rather than assuming data[0] is it.
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', self::AUDIT_LOGS_URL.'?action=field.test', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $entry = json_decode($client->getResponse()->getContent(), true)['data'][0];

        self::assertArrayHasKey('id', $entry);
        self::assertSame($actor->getEmail(), $entry['user_email']);
        self::assertSame('field.test', $entry['action']);
        self::assertSame('User', $entry['resource_type']);
        self::assertSame((string) $resourceId, $entry['resource_id']);
        self::assertSame('10.0.0.1', $entry['ip_address']);
        self::assertSame(['key' => 'value'], $entry['metadata']);
        self::assertArrayHasKey('timestamp', $entry);
        self::assertArrayHasKey('old_value_hash', $entry);
        self::assertArrayHasKey('new_value_hash', $entry);
    }

    public function testEntryWithoutUserHasNullEmail(): void
    {
        $client = static::createClient();
        static::getContainer()->get(AuditService::class)->log('system.action', 'System', Uuid::v7());

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', self::AUDIT_LOGS_URL.'?action=system.action', server: $this->authHeader($token));

        $entry = json_decode($client->getResponse()->getContent(), true)['data'][0];
        self::assertNull($entry['user_email']);
    }

    public function testUserEmailIsNullForDeletedUser(): void
    {
        $client = static::createClient();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $ghost = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        $em->flush();
        $ghostId = $ghost->getId();

        static::getContainer()->get(AuditService::class)->log('ghost.action', 'User', $ghostId, $ghost);

        // Hard-delete — the audit row (a raw UUID column, not an FK)
        // must survive intact, matching Django's TASK-291 guarantee.
        $freshGhost = $em->getRepository(User::class)->find($ghostId);
        $em->remove($freshGhost);
        $em->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', self::AUDIT_LOGS_URL.'?action=ghost.action', server: $this->authHeader($token));

        $entry = json_decode($client->getResponse()->getContent(), true)['data'][0];
        self::assertNull($entry['user_email']);
    }

    public function testFilterByResourceType(): void
    {
        $client = static::createClient();
        $auditService = static::getContainer()->get(AuditService::class);
        $auditService->log('a1', 'Appraisal', Uuid::v7());
        $auditService->log('a2', 'User', Uuid::v7());
        $auditService->log('a3', 'Appraisal', Uuid::v7());

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', self::AUDIT_LOGS_URL.'?resource_type=Appraisal', server: $this->authHeader($token));

        $data = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertCount(2, $data);
        foreach ($data as $entry) {
            self::assertSame('Appraisal', $entry['resource_type']);
        }
    }

    public function testFilterByAction(): void
    {
        $client = static::createClient();
        $auditService = static::getContainer()->get(AuditService::class);
        // Deliberately not "user.login" — the login helper below issues
        // a real POST /auth/login/, which now creates its own genuine
        // "user.login" audit entry since LoginController is wired up.
        $auditService->log('test.filter.action', 'User', Uuid::v7());
        $auditService->log('appraisal.submit', 'Appraisal', Uuid::v7());
        $auditService->log('test.filter.action', 'User', Uuid::v7());

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', self::AUDIT_LOGS_URL.'?action=test.filter.action', server: $this->authHeader($token));

        $data = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertCount(2, $data);
    }

    public function testFilterByResourceId(): void
    {
        $client = static::createClient();
        $targetId = Uuid::v7();
        $auditService = static::getContainer()->get(AuditService::class);
        $auditService->log('a', 'T', $targetId);
        $auditService->log('a', 'T', Uuid::v7());

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', self::AUDIT_LOGS_URL.'?resource_id='.$targetId, server: $this->authHeader($token));

        $data = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertCount(1, $data);
        self::assertSame((string) $targetId, $data[0]['resource_id']);
    }

    public function testFilterByUserId(): void
    {
        $client = static::createClient();
        $userA = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        $userB = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        $auditService = static::getContainer()->get(AuditService::class);
        $auditService->log('a', 'T', Uuid::v7(), $userA);
        $auditService->log('a', 'T', Uuid::v7(), $userB);
        $auditService->log('a', 'T', Uuid::v7(), $userA);

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', self::AUDIT_LOGS_URL.'?user_id='.$userA->getId(), server: $this->authHeader($token));

        $data = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertCount(2, $data);
    }

    public function testFilterByDateRange(): void
    {
        $client = static::createClient();
        $auditService = static::getContainer()->get(AuditService::class);
        $auditService->log('old.entry', 'Test', Uuid::v7());
        $auditService->log('mid.entry', 'Test', Uuid::v7());
        $auditService->log('new.entry', 'Test', Uuid::v7());

        $now = new \DateTimeImmutable();
        $gte = $now->modify('-1 minute')->format(\DateTimeInterface::ATOM);
        $lte = $now->modify('+1 minute')->format(\DateTimeInterface::ATOM);

        // resource_type filter isolates these 3 from the login helper's
        // own real "user.login" (resource_type=User) audit entry,
        // which otherwise also falls inside this same time window.
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', self::AUDIT_LOGS_URL.'?resource_type=Test&timestamp__gte='.urlencode($gte).'&timestamp__lte='.urlencode($lte), server: $this->authHeader($token));

        $data = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertCount(3, $data);
    }

    public function testResourceScopedEndpointReturnsOnlyMatchingEntries(): void
    {
        $client = static::createClient();
        $targetId = Uuid::v7();
        $otherId = Uuid::v7();
        $auditService = static::getContainer()->get(AuditService::class);
        $auditService->log('a', 'User', $targetId);
        $auditService->log('a', 'User', $otherId);
        $auditService->log('a', 'User', $targetId);
        $auditService->log('a', 'Appraisal', $targetId);

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/audit/logs/User/'.$targetId.'/', server: $this->authHeader($token));

        $data = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertCount(2, $data);
        foreach ($data as $entry) {
            self::assertSame('User', $entry['resource_type']);
            self::assertSame((string) $targetId, $entry['resource_id']);
        }
    }

    public function testResourceScopedEndpointReturnsEmptyForNonexistentResource(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);

        $client->request('GET', '/api/v1/audit/logs/Appraisal/'.Uuid::v7().'/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        self::assertSame([], json_decode($client->getResponse()->getContent(), true)['data']);
    }

    public function testResourceScopedEndpointValidation(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $header = $this->authHeader($token);

        $client->request('GET', '/api/v1/audit/logs/Appraisal/not-a-valid-uuid/', server: $header);
        self::assertResponseStatusCodeSame(400, 'invalid UUID');

        $longType = str_repeat('A', 101);
        $client->request('GET', '/api/v1/audit/logs/'.$longType.'/'.Uuid::v7().'/', server: $header);
        self::assertResponseStatusCodeSame(400, 'resource_type too long');

        $maxType = str_repeat('A', 100);
        $client->request('GET', '/api/v1/audit/logs/'.$maxType.'/'.Uuid::v7().'/', server: $header);
        self::assertResponseStatusCodeSame(200, 'resource_type at max length');

        $client->request('GET', '/api/v1/audit/logs/Invalid-Type!/'.Uuid::v7().'/', server: $header);
        self::assertResponseStatusCodeSame(400, 'invalid characters');

        $client->request('GET', '/api/v1/audit/logs/My_Resource_Type/'.Uuid::v7().'/', server: $header);
        self::assertResponseStatusCodeSame(200, 'underscores accepted');

        $client->request('GET', '/api/v1/audit/logs/Appraisal//', server: $header);
        self::assertResponseStatusCodeSame(404, 'empty resource_id segment');
    }

    public function testCursorPaginationNavigatesForwardAndBackward(): void
    {
        $client = static::createClient();
        $auditService = static::getContainer()->get(AuditService::class);
        for ($i = 0; $i < 60; ++$i) {
            $auditService->log(sprintf('cursor.test.%03d', $i), 'CursorTest', Uuid::v7());
        }

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $header = $this->authHeader($token);

        $client->request('GET', self::AUDIT_LOGS_URL.'?resource_type=CursorTest', server: $header);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertCount(50, $body['data']);
        $nextUrl = $body['meta']['pagination']['next'];
        self::assertNotNull($nextUrl);

        $client->request('GET', $nextUrl, server: $header);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertCount(10, $body['data']);
        $prevUrl = $body['meta']['pagination']['previous'];
        self::assertNotNull($prevUrl);

        $client->request('GET', $prevUrl, server: $header);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertCount(50, $body['data']);
    }

    private function seedEntry(KernelBrowser $client): void
    {
        static::getContainer()->get(AuditService::class)->log('seed.action', 'Seed', Uuid::v7());
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
