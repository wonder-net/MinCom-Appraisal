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
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class CommentTest extends WebTestCase
{
    public function testAppraiseeCreatesCommentDuringDiscussion(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::DISCUSSION);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/comments/', server: $this->authHeader($accessToken), content: json_encode([
            'content' => 'Looking forward to discussing this.',
        ]));

        self::assertResponseStatusCodeSame(201);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('APPRAISEE', $body['author_role']);
        self::assertSame('Looking forward to discussing this.', $body['content']);
    }

    public function testManagerCommentAutoDerivesAppraiserRole(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::DISCUSSION);
        [$client, $accessToken] = $this->loginAsManagerOf($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/comments/', server: $this->authHeader($accessToken), content: json_encode([
            'content' => 'Great progress this cycle.',
        ]));

        self::assertResponseStatusCodeSame(201);
        self::assertSame('APPRAISER', json_decode($client->getResponse()->getContent(), true)['data']['author_role']);
    }

    public function testUnrelatedHrAdminMustSupplyAuthorRole(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::DISCUSSION);
        [$client, $accessToken] = $this->loginAsHrAdmin($client);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/comments/', server: $this->authHeader($accessToken), content: json_encode([
            'content' => 'HR note.',
        ]));
        self::assertResponseStatusCodeSame(400);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/comments/', server: $this->authHeader($accessToken), content: json_encode([
            'content' => 'HR note.',
            'author_role' => 'APPRAISER',
        ]));
        self::assertResponseStatusCodeSame(201);
        self::assertSame('APPRAISER', json_decode($client->getResponse()->getContent(), true)['data']['author_role']);
    }

    public function testUnrelatedEmployeeCannotComment(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::DISCUSSION);
        [$client, $accessToken] = $this->loginAsUnrelatedEmployee($client);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/comments/', server: $this->authHeader($accessToken), content: json_encode([
            'content' => 'Not my business.',
        ]));

        self::assertResponseStatusCodeSame(403);
    }

    public function testCommentsCannotBeAddedOnFinalisedAppraisal(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::FINALISED);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/comments/', server: $this->authHeader($accessToken), content: json_encode([
            'content' => 'Too late.',
        ]));

        self::assertResponseStatusCodeSame(403);
    }

    public function testHrAdminCanCommentOnSignedOffAppraisal(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::SIGNED_OFF);
        [$client, $accessToken] = $this->loginAsHrAdmin($client);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/comments/', server: $this->authHeader($accessToken), content: json_encode([
            'content' => 'Final remark before we finalise.',
            'author_role' => 'APPRAISER',
        ]));

        self::assertResponseStatusCodeSame(201);
    }

    public function testEmptyContentRejected(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::DISCUSSION);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/comments/', server: $this->authHeader($accessToken), content: json_encode([
            'content' => '   ',
        ]));

        self::assertResponseStatusCodeSame(400);
    }

    public function testListOrdersByCreatedAtAscending(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::DISCUSSION);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/comments/', server: $this->authHeader($accessToken), content: json_encode(['content' => 'First']));
        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/comments/', server: $this->authHeader($accessToken), content: json_encode(['content' => 'Second']));

        $client->request('GET', '/api/v1/appraisals/'.$appraisal->getId().'/comments/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame(['First', 'Second'], array_column($body, 'content'));
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
    private function loginAsUnrelatedEmployee(KernelBrowser $client): array
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
        $manager = $appraisal->getEmployee()->getManager();
        \assert($manager instanceof Employee);
        $manager->getUser()->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        return $this->login($manager->getUser(), $client);
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
