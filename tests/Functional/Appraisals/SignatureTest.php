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
use App\Factory\RoleFactory;
use App\Factory\UserFactory;
use App\Repository\AppraisalRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class SignatureTest extends WebTestCase
{
    public function testBothPartiesAcceptingTriggersSignedOff(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::PENDING_SIGNOFF);
        $appraisalId = (string) $appraisal->getId();
        [$client, $appraiseeToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisalId.'/sign/', server: $this->authHeader($appraiseeToken), content: json_encode(['action' => 'ACCEPT', 'discussed' => true]));
        self::assertResponseStatusCodeSame(201);

        [$client, $managerToken] = $this->loginAsManagerOf($client, $appraisal);
        $client->request('POST', '/api/v1/appraisals/'.$appraisalId.'/sign/', server: $this->authHeader($managerToken), content: json_encode(['action' => 'ACCEPT', 'discussed' => true]));
        self::assertResponseStatusCodeSame(201);

        /** @var AppraisalRepository $appraisals */
        $appraisals = static::getContainer()->get(AppraisalRepository::class);
        self::assertSame(AppraisalStatus::SIGNED_OFF, $appraisals->findById($appraisalId)->getStatus());
    }

    public function testRejectTriggersDisputed(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::PENDING_SIGNOFF);
        $appraisalId = (string) $appraisal->getId();
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisalId.'/sign/', server: $this->authHeader($accessToken), content: json_encode([
            'action' => 'REJECT',
            'reason' => 'I disagree with the manager rating.',
        ]));

        self::assertResponseStatusCodeSame(201);

        /** @var AppraisalRepository $appraisals */
        $appraisals = static::getContainer()->get(AppraisalRepository::class);
        self::assertSame(AppraisalStatus::DISPUTED, $appraisals->findById($appraisalId)->getStatus());
    }

    public function testRejectWithoutReasonReturns400(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::PENDING_SIGNOFF);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/sign/', server: $this->authHeader($accessToken), content: json_encode(['action' => 'REJECT']));
        self::assertResponseStatusCodeSame(400);
    }

    public function testDuplicateSignatureReturns409(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::PENDING_SIGNOFF);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/sign/', server: $this->authHeader($accessToken), content: json_encode(['action' => 'ACCEPT']));
        self::assertResponseStatusCodeSame(201);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/sign/', server: $this->authHeader($accessToken), content: json_encode(['action' => 'ACCEPT']));
        self::assertResponseStatusCodeSame(409);
        self::assertSame('ALREADY_SIGNED', json_decode($client->getResponse()->getContent(), true)['data']['code']);
    }

    public function testCannotSignOutsidePendingSignoff(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::DISCUSSION);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/sign/', server: $this->authHeader($accessToken), content: json_encode(['action' => 'ACCEPT']));
        self::assertResponseStatusCodeSame(403);
    }

    public function testUnrelatedUserCannotSign(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::PENDING_SIGNOFF);
        [$client, $accessToken] = $this->loginAsHrAdmin($client);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/sign/', server: $this->authHeader($accessToken), content: json_encode(['action' => 'ACCEPT']));
        self::assertResponseStatusCodeSame(403);
    }

    public function testSignResponseShapeExcludesForensicFields(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::PENDING_SIGNOFF);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/sign/', server: $this->authHeader($accessToken), content: json_encode(['action' => 'ACCEPT']));
        self::assertResponseStatusCodeSame(201);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];

        self::assertArrayHasKey('signer_name', $body);
        self::assertArrayHasKey('signer_role', $body);
        self::assertArrayNotHasKey('ip_address', $body);
        self::assertArrayNotHasKey('user_agent_hash', $body);
        self::assertArrayNotHasKey('signing_round', $body);
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
     * @return array{0: KernelBrowser, 1: string}
     */
    private function loginAsAppraisee(KernelBrowser $client, Appraisal $appraisal): array
    {
        $user = $appraisal->getEmployee()->getUser();
        $user->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        return $this->login($user, $client);
    }

    /**
     * @return array{0: KernelBrowser, 1: string}
     */
    private function loginAsManagerOf(KernelBrowser $client, Appraisal $appraisal): array
    {
        // Re-fetch fresh via the *current* container's EntityManager rather
        // than mutating the possibly-stale $appraisal object — a prior
        // $client->request() in this test may have rebooted the kernel,
        // detaching every entity loaded through the old container. Only
        // the UUID (read-only, safe on a detached object) survives that.
        $managerEmployee = $appraisal->getEmployee()->getManager();
        \assert($managerEmployee instanceof Employee);
        $managerUserId = (string) $managerEmployee->getUser()->getId();

        $em = static::getContainer()->get(EntityManagerInterface::class);
        $user = $em->getRepository(User::class)->find($managerUserId);
        \assert($user instanceof User);
        $user->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        $em->flush();

        return $this->login($user, $client);
    }

    private function makeAppraisal(AppraisalStatus $status): Appraisal
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

        return $appraisal;
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
