<?php

declare(strict_types=1);

namespace App\Tests\Functional\Admin\Competencies;

use App\Enum\CompetencyApplicableTo;
use App\Enum\RoleName;
use App\Factory\CompetencyFactory;
use App\Factory\UserFactory;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Cache\CacheItemPoolInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class AdminCompetencyTest extends WebTestCase
{
    private const LIST_URL = '/api/v1/admin/competencies/';

    /**
     * The competencies list cache is backed by the filesystem adapter,
     * which (unlike the DB) is NOT rolled back between tests by
     * dama/doctrine-test-bundle — a prior test's cached listing would
     * otherwise leak into this one. Mirrors Django's own test setup,
     * which explicitly calls cache.clear() in an autouse fixture before
     * every test (see test_admin_competency_views.py's _override_settings).
     * Must run through the very same client each test creates (WebTestCase
     * forbids booting the kernel before createClient()), so this wraps
     * createClient() itself rather than using setUp().
     */
    private static function freshClient(): KernelBrowser
    {
        $client = static::createClient();
        static::getContainer()->get(CacheItemPoolInterface::class)->clear();

        return $client;
    }

    public function testAuthenticatedUserGetsActiveCompetencies(): void
    {
        $client = self::freshClient();
        CompetencyFactory::new()->create(['name' => 'Active Comp', 'sortOrder' => 100]);
        CompetencyFactory::new()->inactive()->create(['name' => 'Inactive Comp', 'sortOrder' => 101]);
        [$client, $accessToken] = $this->loginAs(RoleName::EMPLOYEE, $client);

        $client->request('GET', self::LIST_URL, server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $names = array_column(json_decode($client->getResponse()->getContent(), true)['data'], 'name');

        self::assertContains('Active Comp', $names);
        self::assertNotContains('Inactive Comp', $names);
    }

    public function testUnauthenticatedReturns401(): void
    {
        $client = self::freshClient();
        $client->request('GET', self::LIST_URL);
        self::assertResponseStatusCodeSame(401);
    }

    public function testIncludeInactiveHrAdminSeesAll(): void
    {
        $client = self::freshClient();
        CompetencyFactory::new()->create(['name' => 'Active', 'sortOrder' => 200]);
        CompetencyFactory::new()->inactive()->create(['name' => 'Inactive', 'sortOrder' => 201]);
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('GET', self::LIST_URL.'?include_inactive=true', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $names = array_column(json_decode($client->getResponse()->getContent(), true)['data'], 'name');

        self::assertContains('Active', $names);
        self::assertContains('Inactive', $names);
    }

    public function testIncludeInactiveNonHrAdminStillSeesOnlyActive(): void
    {
        $client = self::freshClient();
        CompetencyFactory::new()->create(['name' => 'Active2', 'sortOrder' => 300]);
        CompetencyFactory::new()->inactive()->create(['name' => 'Inactive2', 'sortOrder' => 301]);
        [$client, $accessToken] = $this->loginAs(RoleName::EMPLOYEE, $client);

        $client->request('GET', self::LIST_URL.'?include_inactive=true', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $names = array_column(json_decode($client->getResponse()->getContent(), true)['data'], 'name');

        self::assertContains('Active2', $names);
        self::assertNotContains('Inactive2', $names);
    }

    public function testResponseContainsExpectedFields(): void
    {
        $client = self::freshClient();
        CompetencyFactory::new()->create(['name' => 'Safety', 'applicableTo' => CompetencyApplicableTo::ALL, 'sortOrder' => 400]);
        [$client, $accessToken] = $this->loginAs(RoleName::EMPLOYEE, $client);

        $client->request('GET', self::LIST_URL, server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $items = json_decode($client->getResponse()->getContent(), true)['data'];
        $bySafety = current(array_filter($items, static fn ($i) => $i['name'] === 'Safety'));

        self::assertNotFalse($bySafety);
        self::assertArrayHasKey('id', $bySafety);
        self::assertSame('ALL', $bySafety['category']);
        self::assertSame('ALL', $bySafety['applicable_to']);
        self::assertTrue($bySafety['is_active']);
        self::assertTrue($bySafety['is_core']);
    }

    public function testHrAdminCreatesCompetency(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, self::freshClient());

        $client->request('POST', self::LIST_URL, server: $this->authHeader($accessToken), content: json_encode([
            'name' => 'New Competency',
            'category' => 'ALL',
        ]));

        self::assertResponseStatusCodeSame(201);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('New Competency', $body['name']);
        self::assertSame('ALL', $body['category']);
        self::assertTrue($body['is_active']);
        self::assertFalse($body['is_core']);
    }

    public function testDuplicateNameCategoryReturns409(): void
    {
        $client = self::freshClient();
        CompetencyFactory::new()->create(['name' => 'Duplicate', 'applicableTo' => CompetencyApplicableTo::MANAGERIAL, 'sortOrder' => 500]);
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('POST', self::LIST_URL, server: $this->authHeader($accessToken), content: json_encode([
            'name' => 'Duplicate',
            'category' => 'MANAGERIAL',
        ]));

        self::assertResponseStatusCodeSame(409);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertSame('CONFLICT', $body['data']['code']);
        self::assertStringContainsString('already exists', $body['data']['message']);
    }

    public function testDuplicateCheckIsCaseInsensitive(): void
    {
        $client = self::freshClient();
        CompetencyFactory::new()->create(['name' => 'Safety Case', 'applicableTo' => CompetencyApplicableTo::ALL, 'sortOrder' => 600]);
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('POST', self::LIST_URL, server: $this->authHeader($accessToken), content: json_encode([
            'name' => 'safety case',
            'category' => 'ALL',
        ]));

        self::assertResponseStatusCodeSame(409);
    }

    public function testSameNameDifferentCategoryStillConflicts(): void
    {
        $client = self::freshClient();
        CompetencyFactory::new()->create(['name' => 'Leadership', 'applicableTo' => CompetencyApplicableTo::MANAGERIAL, 'sortOrder' => 700]);
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('POST', self::LIST_URL, server: $this->authHeader($accessToken), content: json_encode([
            'name' => 'Leadership',
            'category' => 'NON_MANAGERIAL',
        ]));

        self::assertResponseStatusCodeSame(409);
    }

    public function testNonHrAdminPostReturns403(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::EMPLOYEE, self::freshClient());

        $client->request('POST', self::LIST_URL, server: $this->authHeader($accessToken), content: json_encode([
            'name' => 'Forbidden',
            'category' => 'ALL',
        ]));

        self::assertResponseStatusCodeSame(403);
    }

    public function testMissingRequiredFieldsReturns400(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, self::freshClient());

        $client->request('POST', self::LIST_URL, server: $this->authHeader($accessToken), content: json_encode([]));

        self::assertResponseStatusCodeSame(400);
    }

    public function testHrAdminDeactivatesCompetency(): void
    {
        $client = self::freshClient();
        $competency = CompetencyFactory::new()->create(['name' => 'To Deactivate', 'sortOrder' => 800]);
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('PATCH', self::detailUrl((string) $competency->getId()), server: $this->authHeader($accessToken), content: json_encode(['is_active' => false]));

        self::assertResponseIsSuccessful();
        self::assertFalse(json_decode($client->getResponse()->getContent(), true)['data']['is_active']);
    }

    public function testHrAdminReactivatesCompetency(): void
    {
        $client = self::freshClient();
        $competency = CompetencyFactory::new()->inactive()->create(['name' => 'To Reactivate', 'sortOrder' => 801]);
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('PATCH', self::detailUrl((string) $competency->getId()), server: $this->authHeader($accessToken), content: json_encode(['is_active' => true]));

        self::assertResponseIsSuccessful();
        self::assertTrue(json_decode($client->getResponse()->getContent(), true)['data']['is_active']);
    }

    public function testPatchNameReturns400(): void
    {
        $client = self::freshClient();
        $competency = CompetencyFactory::new()->create(['name' => 'No Name Change', 'sortOrder' => 802]);
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('PATCH', self::detailUrl((string) $competency->getId()), server: $this->authHeader($accessToken), content: json_encode(['name' => 'New Name']));

        self::assertResponseStatusCodeSame(400);
    }

    public function testPatchCategoryReturns400(): void
    {
        $client = self::freshClient();
        $competency = CompetencyFactory::new()->create(['name' => 'No Cat Change', 'sortOrder' => 803]);
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('PATCH', self::detailUrl((string) $competency->getId()), server: $this->authHeader($accessToken), content: json_encode(['category' => 'MANAGERIAL']));

        self::assertResponseStatusCodeSame(400);
    }

    public function testNonHrAdminPatchReturns403(): void
    {
        $client = self::freshClient();
        $competency = CompetencyFactory::new()->create(['name' => 'Forbidden Update', 'sortOrder' => 804]);
        [$client, $accessToken] = $this->loginAs(RoleName::EMPLOYEE, $client);

        $client->request('PATCH', self::detailUrl((string) $competency->getId()), server: $this->authHeader($accessToken), content: json_encode(['is_active' => false]));

        self::assertResponseStatusCodeSame(403);
    }

    public function testPatchNonexistentReturns404(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, self::freshClient());

        $client->request('PATCH', self::detailUrl('01923456-789a-7bcd-8ef0-123456789abc'), server: $this->authHeader($accessToken), content: json_encode(['is_active' => false]));

        self::assertResponseStatusCodeSame(404);
    }

    public function testPatchSortOrderOnlyWithoutIsActiveSucceeds(): void
    {
        $client = self::freshClient();
        $competency = CompetencyFactory::new()->create(['name' => 'Diff-only Sort Update', 'sortOrder' => 805]);
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('PATCH', self::detailUrl((string) $competency->getId()), server: $this->authHeader($accessToken), content: json_encode(['sort_order' => 7]));

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame(7, $body['sort_order']);
        self::assertTrue($body['is_active']);
    }

    public function testPatchIsCoreSucceeds(): void
    {
        $client = self::freshClient();
        $competency = CompetencyFactory::new()->create(['name' => 'Is Core Update', 'isCore' => false, 'sortOrder' => 806]);
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('PATCH', self::detailUrl((string) $competency->getId()), server: $this->authHeader($accessToken), content: json_encode(['is_core' => true]));

        self::assertResponseIsSuccessful();
        self::assertTrue(json_decode($client->getResponse()->getContent(), true)['data']['is_core']);
    }

    public function testPatchApplicableToSucceeds(): void
    {
        $client = self::freshClient();
        $competency = CompetencyFactory::new()->create(['name' => 'Applicable To Update', 'applicableTo' => CompetencyApplicableTo::ALL, 'sortOrder' => 807]);
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('PATCH', self::detailUrl((string) $competency->getId()), server: $this->authHeader($accessToken), content: json_encode(['applicable_to' => 'MANAGERIAL']));

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('MANAGERIAL', $body['applicable_to']);
        self::assertSame('MANAGERIAL', $body['category']);
    }

    public function testPatchBadApplicableToEnumReturns400(): void
    {
        $client = self::freshClient();
        $competency = CompetencyFactory::new()->create(['name' => 'Bad Enum', 'sortOrder' => 808]);
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('PATCH', self::detailUrl((string) $competency->getId()), server: $this->authHeader($accessToken), content: json_encode(['applicable_to' => 'INVALID']));

        self::assertResponseStatusCodeSame(400);
    }

    public function testPatchCombinedFieldsSucceeds(): void
    {
        $client = self::freshClient();
        $competency = CompetencyFactory::new()->create([
            'name' => 'Combined Update',
            'applicableTo' => CompetencyApplicableTo::ALL,
            'isCore' => false,
            'sortOrder' => 809,
        ]);
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('PATCH', self::detailUrl((string) $competency->getId()), server: $this->authHeader($accessToken), content: json_encode([
            'is_active' => false,
            'applicable_to' => 'NON_MANAGERIAL',
            'is_core' => true,
            'sort_order' => 9,
        ]));

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertFalse($body['is_active']);
        self::assertSame('NON_MANAGERIAL', $body['applicable_to']);
        self::assertTrue($body['is_core']);
        self::assertSame(9, $body['sort_order']);
    }

    private static function detailUrl(string $id): string
    {
        return '/api/v1/admin/competencies/'.$id.'/';
    }

    /**
     * @return array{0: KernelBrowser, 1: string}
     */
    private function loginAs(RoleName $role, KernelBrowser $client): array
    {
        $user = UserFactory::new()->withRoles($role)->create();
        $user->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

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
