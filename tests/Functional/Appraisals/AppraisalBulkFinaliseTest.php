<?php

declare(strict_types=1);

namespace App\Tests\Functional\Appraisals;

use App\Entity\Appraisal;
use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Enum\RoleName;
use App\Factory\AppraisalCycleFactory;
use App\Factory\AppraisalFactory;
use App\Factory\EmployeeFactory;
use App\Factory\UserFactory;
use App\Repository\AuditLogRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\Uid\Uuid;

/**
 * Port of AppraisalViewSet.bulk_finalise's test coverage: up to 500
 * arbitrary appraisal ids, SIGNED_OFF -> FINALISED only, non-SIGNED_OFF
 * ids silently skipped, the 400 validation branches, and per-appraisal
 * audit logging. Distinct from AppraisalCycleTest's finalise-all
 * coverage (per-cycle, no ids).
 */
final class AppraisalBulkFinaliseTest extends WebTestCase
{
    private const URL = '/api/v1/appraisals/bulk-finalise/';

    public function testFinalisesSignedOffAppraisalsAndSkipsOthers(): void
    {
        $client = static::createClient();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $signedOff1 = AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::SIGNED_OFF]);
        $signedOff2 = AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::SIGNED_OFF]);
        $inDiscussion = AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::DISCUSSION]);
        $this->flush();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $client->request('POST', self::URL, server: $this->authHeader($token), content: json_encode([
            'appraisal_ids' => [(string) $signedOff1->getId(), (string) $signedOff2->getId(), (string) $inDiscussion->getId()],
        ]));

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame(2, $body['finalised']);
        self::assertSame(1, $body['skipped']);

        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->clear();
        $refreshed1 = $em->getRepository(Appraisal::class)->find($signedOff1->getId());
        $refreshed2 = $em->getRepository(Appraisal::class)->find($signedOff2->getId());
        $refreshedDiscussion = $em->getRepository(Appraisal::class)->find($inDiscussion->getId());
        \assert($refreshed1 instanceof Appraisal && $refreshed2 instanceof Appraisal && $refreshedDiscussion instanceof Appraisal);

        self::assertSame(AppraisalStatus::FINALISED, $refreshed1->getStatus());
        self::assertSame(AppraisalStatus::FINALISED, $refreshed2->getStatus());
        self::assertSame(AppraisalStatus::DISCUSSION, $refreshedDiscussion->getStatus());
    }

    public function testWritesAuditLogEntryPerFinalisedAppraisal(): void
    {
        $client = static::createClient();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $appraisal = AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::SIGNED_OFF]);
        $this->flush();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $client->request('POST', self::URL, server: $this->authHeader($token), content: json_encode([
            'appraisal_ids' => [(string) $appraisal->getId()],
        ]));
        self::assertResponseIsSuccessful();

        /** @var AuditLogRepository $auditLogs */
        $auditLogs = static::getContainer()->get(AuditLogRepository::class);
        $entries = $auditLogs->findBy(['resourceId' => $appraisal->getId(), 'action' => 'appraisal.finalised']);
        self::assertCount(1, $entries);
    }

    public function testEmptyIdsListReturns400(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $client->request('POST', self::URL, server: $this->authHeader($token), content: json_encode(['appraisal_ids' => []]));

        self::assertResponseStatusCodeSame(400);
        self::assertStringContainsString('non-empty list', json_decode($client->getResponse()->getContent(), true)['data']['detail']);
    }

    public function testMoreThanFiveHundredIdsReturns400(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $ids = array_map(static fn (): string => (string) Uuid::v4(), range(1, 501));
        $client->request('POST', self::URL, server: $this->authHeader($token), content: json_encode(['appraisal_ids' => $ids]));

        self::assertResponseStatusCodeSame(400);
        self::assertStringContainsString('Cannot finalise more than 500', json_decode($client->getResponse()->getContent(), true)['data']['detail']);
    }

    public function testAllInvalidIdsReturns400(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $client->request('POST', self::URL, server: $this->authHeader($token), content: json_encode(['appraisal_ids' => ['not-a-uuid', 'also-bad']]));

        self::assertResponseStatusCodeSame(400);
        self::assertStringContainsString('No valid appraisal IDs provided', json_decode($client->getResponse()->getContent(), true)['data']['detail']);
    }

    public function testDuplicateIdsCountedOnce(): void
    {
        $client = static::createClient();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $appraisal = AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::SIGNED_OFF]);
        $this->flush();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $id = (string) $appraisal->getId();
        $client->request('POST', self::URL, server: $this->authHeader($token), content: json_encode(['appraisal_ids' => [$id, $id]]));

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame(1, $body['finalised']);
        self::assertSame(0, $body['skipped']);
    }

    public function testNonExistentIdIsSkipped(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $client->request('POST', self::URL, server: $this->authHeader($token), content: json_encode([
            'appraisal_ids' => [(string) Uuid::v4()],
        ]));

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame(0, $body['finalised']);
        self::assertSame(1, $body['skipped']);
    }

    public function testNonAdminForbidden(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAs(RoleName::EMPLOYEE, $client);

        $client->request('POST', self::URL, server: $this->authHeader($token), content: json_encode([
            'appraisal_ids' => [(string) Uuid::v4()],
        ]));

        self::assertResponseStatusCodeSame(403);
    }

    /**
     * @return array{0: KernelBrowser, 1: string}
     */
    private function loginAsHrAdmin(KernelBrowser $client): array
    {
        return $this->loginAs(RoleName::HR_ADMIN, $client);
    }

    /**
     * @return array{0: KernelBrowser, 1: string}
     */
    private function loginAs(RoleName $role, KernelBrowser $client): array
    {
        $user = UserFactory::new()->withRoles($role)->create();
        $user->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        if ($role !== RoleName::HR_ADMIN && $role !== RoleName::SYSTEM_ADMIN) {
            EmployeeFactory::new()->create(['user' => $user]);
        }
        $this->flush();

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

    private function flush(): void
    {
        static::getContainer()->get(EntityManagerInterface::class)->flush();
    }
}
