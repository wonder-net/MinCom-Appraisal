<?php

declare(strict_types=1);

namespace App\Tests\Functional\Appraisals;

use App\Entity\Appraisal;
use App\Entity\CalibrationSession;
use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Enum\RoleName;
use App\Factory\AppraisalCycleFactory;
use App\Factory\AppraisalFactory;
use App\Factory\EmployeeFactory;
use App\Factory\UserFactory;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Cache\CacheItemPoolInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class AppraisalCycleTest extends WebTestCase
{
    private const LIST_URL = '/api/v1/appraisals/cycles/';

    private static function freshClient(): KernelBrowser
    {
        $client = static::createClient();
        static::getContainer()->get(CacheItemPoolInterface::class)->clear();

        return $client;
    }

    public function testNonAdminSeesOnlyActiveCycles(): void
    {
        $client = self::freshClient();
        AppraisalCycleFactory::new()->create(['periodName' => 'Draft Cycle']);
        AppraisalCycleFactory::new()->active()->create(['periodName' => 'Active Cycle']);
        [$client, $accessToken] = $this->loginAs(RoleName::EMPLOYEE, $client);

        $client->request('GET', self::LIST_URL, server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $names = array_column(json_decode($client->getResponse()->getContent(), true)['data'], 'period_name');

        self::assertContains('Active Cycle', $names);
        self::assertNotContains('Draft Cycle', $names);
    }

    public function testHrAdminSeesAllCycles(): void
    {
        $client = self::freshClient();
        AppraisalCycleFactory::new()->create(['periodName' => 'Draft Cycle 2']);
        AppraisalCycleFactory::new()->active()->create(['periodName' => 'Active Cycle 2']);
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('GET', self::LIST_URL, server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $names = array_column(json_decode($client->getResponse()->getContent(), true)['data'], 'period_name');

        self::assertContains('Active Cycle 2', $names);
        self::assertContains('Draft Cycle 2', $names);
    }

    public function testHrAdminCreatesCycle(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, self::freshClient());

        $client->request('POST', self::LIST_URL, server: $this->authHeader($accessToken), content: json_encode([
            'period_name' => '2026 Annual Review',
            'start_date' => '2026-01-01',
            'end_date' => '2026-03-01',
        ]));

        self::assertResponseStatusCodeSame(201);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('2026 Annual Review', $body['period_name']);
        self::assertSame('DRAFT', $body['status']);
        self::assertFalse($body['is_active']);
        self::assertTrue($body['self_rating_enabled']);
        self::assertSame([], $body['config_snapshot']);
    }

    public function testCreateRejectsEndDateBeforeStartDate(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, self::freshClient());

        $client->request('POST', self::LIST_URL, server: $this->authHeader($accessToken), content: json_encode([
            'period_name' => 'Bad Dates',
            'start_date' => '2026-03-01',
            'end_date' => '2026-01-01',
        ]));

        self::assertResponseStatusCodeSame(400);
        $fields = array_column(json_decode($client->getResponse()->getContent(), true)['data']['errors'], 'field');
        self::assertContains('end_date', $fields);
    }

    public function testCreateMissingFieldsReturns400(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, self::freshClient());

        $client->request('POST', self::LIST_URL, server: $this->authHeader($accessToken), content: json_encode([]));

        self::assertResponseStatusCodeSame(400);
    }

    public function testNonAdminCreateReturns403(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::EMPLOYEE, self::freshClient());

        $client->request('POST', self::LIST_URL, server: $this->authHeader($accessToken), content: json_encode([
            'period_name' => 'Forbidden',
            'start_date' => '2026-01-01',
            'end_date' => '2026-03-01',
        ]));

        self::assertResponseStatusCodeSame(403);
    }

    public function testUpdateDraftCycleSucceeds(): void
    {
        $client = self::freshClient();
        $cycle = AppraisalCycleFactory::new()->create(['periodName' => 'Original']);
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('PATCH', self::LIST_URL.$cycle->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'period_name' => 'Updated Name',
        ]));

        self::assertResponseIsSuccessful();
        self::assertSame('Updated Name', json_decode($client->getResponse()->getContent(), true)['data']['period_name']);
    }

    public function testUpdateNonDraftCycleReturns400(): void
    {
        $client = self::freshClient();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('PATCH', self::LIST_URL.$cycle->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'period_name' => 'Nope',
        ]));

        self::assertResponseStatusCodeSame(400);
        self::assertSame('Only DRAFT cycles can be updated.', json_decode($client->getResponse()->getContent(), true)['data']['detail']);
    }

    public function testActivateCreatesAppraisalsAndCompetencyRatingsForActiveEmployees(): void
    {
        $client = self::freshClient();
        $cycle = AppraisalCycleFactory::new()->create();
        EmployeeFactory::new()->create();
        EmployeeFactory::new()->create();
        EmployeeFactory::new()->inactive()->create();
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('POST', self::LIST_URL.$cycle->getId().'/activate/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('ACTIVE', $body['status']);
        self::assertNotSame([], $body['config_snapshot']);
        self::assertArrayHasKey('competencies', $body['config_snapshot']);
        self::assertArrayHasKey('bsc_perspectives', $body['config_snapshot']);
        self::assertArrayHasKey('score_descriptors', $body['config_snapshot']);

        $client->request('GET', '/api/v1/appraisals/?cycle_id='.$cycle->getId(), server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        // 2 active employees + the HR Admin (also an active employee-less user,
        // no employee profile so not counted) => exactly 2 appraisals created.
        self::assertSame(2, json_decode($client->getResponse()->getContent(), true)['meta']['pagination']['count']);
    }

    public function testActivateNonDraftCycleReturns400(): void
    {
        $client = self::freshClient();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('POST', self::LIST_URL.$cycle->getId().'/activate/', server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(400);
    }

    public function testCloseTransitionsNonTerminalAppraisalsToIncomplete(): void
    {
        $client = self::freshClient();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $nonTerminal = AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::SELF_ASSESSMENT]);
        $signedOff = AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::SIGNED_OFF]);
        $nonTerminalId = (string) $nonTerminal->getId();
        $signedOffId = (string) $signedOff->getId();
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('POST', self::LIST_URL.$cycle->getId().'/close/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        self::assertSame('CLOSED', json_decode($client->getResponse()->getContent(), true)['data']['status']);

        /** @var \App\Repository\AppraisalRepository $appraisals */
        $appraisals = static::getContainer()->get(\App\Repository\AppraisalRepository::class);
        self::assertSame(AppraisalStatus::INCOMPLETE, $appraisals->findById($nonTerminalId)->getStatus());
        self::assertSame(AppraisalStatus::SIGNED_OFF, $appraisals->findById($signedOffId)->getStatus());
    }

    public function testCloseNonActiveCycleReturns400(): void
    {
        $client = self::freshClient();
        $cycle = AppraisalCycleFactory::new()->create();
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('POST', self::LIST_URL.$cycle->getId().'/close/', server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(400);
    }

    public function testArchiveClosedCycleSucceeds(): void
    {
        $client = self::freshClient();
        $cycle = AppraisalCycleFactory::new()->closed()->create();
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('POST', self::LIST_URL.$cycle->getId().'/archive/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        self::assertSame('ARCHIVED', json_decode($client->getResponse()->getContent(), true)['data']['status']);
    }

    public function testArchiveNonClosedCycleReturns400(): void
    {
        $client = self::freshClient();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('POST', self::LIST_URL.$cycle->getId().'/archive/', server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(400);
        self::assertSame('Only CLOSED cycles can be archived.', json_decode($client->getResponse()->getContent(), true)['data']['detail']);
    }

    public function testFinaliseAllFinalisesOnlySignedOffAppraisals(): void
    {
        $client = self::freshClient();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $signedOff1 = AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::SIGNED_OFF]);
        $signedOff2 = AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::SIGNED_OFF]);
        AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::DISCUSSION]);
        $this->completeCalibration($signedOff1);
        $this->completeCalibration($signedOff2);
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('POST', self::LIST_URL.$cycle->getId().'/finalise-all/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        self::assertSame(2, json_decode($client->getResponse()->getContent(), true)['data']['finalised']);
    }

    public function testNonAdminCannotSeeDraftCycleDetail(): void
    {
        $client = self::freshClient();
        $cycle = AppraisalCycleFactory::new()->create();
        [$client, $accessToken] = $this->loginAs(RoleName::EMPLOYEE, $client);

        $client->request('GET', self::LIST_URL.$cycle->getId().'/', server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(404);
    }

    public function testAdminCanSeeDraftCycleDetail(): void
    {
        $client = self::freshClient();
        $cycle = AppraisalCycleFactory::new()->create(['periodName' => 'Visible To Admin']);
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('GET', self::LIST_URL.$cycle->getId().'/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        self::assertSame('Visible To Admin', json_decode($client->getResponse()->getContent(), true)['data']['period_name']);
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
     * Calibration (product roadmap item, see CalibrationSession's
     * docblock): SIGNED_OFF -> FINALISED now gates on the appraisee's
     * department having a COMPLETE calibration session for the cycle —
     * checked directly in finalise-all (it bypasses WorkflowGuardService
     * entirely), so tests exercising a successful finalise-all need one
     * set up first.
     */
    private function completeCalibration(Appraisal $appraisal): void
    {
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $session = new CalibrationSession($appraisal->getCycle(), $appraisal->getEmployee()->getDepartment());
        $session->markComplete(UserFactory::new()->create(), null);
        $em->persist($session);
        $em->flush();
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
