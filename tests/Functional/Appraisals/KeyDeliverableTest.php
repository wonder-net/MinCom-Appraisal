<?php

declare(strict_types=1);

namespace App\Tests\Functional\Appraisals;

use App\Entity\Appraisal;
use App\Entity\BscPerspective;
use App\Entity\Employee;
use App\Entity\User;
use App\Enum\AppraisalFormType;
use App\Enum\AppraisalStatus;
use App\Enum\RoleName;
use App\Factory\AppraisalCycleFactory;
use App\Factory\AppraisalFactory;
use App\Factory\BscPerspectiveFactory;
use App\Factory\EmployeeFactory;
use App\Factory\KeyDeliverableFactory;
use App\Factory\RoleFactory;
use App\Factory\UserFactory;
use App\Service\PerspectiveKeyResolver;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class KeyDeliverableTest extends WebTestCase
{
    public function testListReturns404ForNonexistentAppraisal(): void
    {
        [$client, $accessToken] = $this->loginAsHrAdmin(static::createClient());

        $client->request('GET', '/api/v1/appraisals/01923456-789a-7bcd-8ef0-123456789abc/deliverables/', server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(404);
    }

    public function testListReturns403ForUnauthorizedUser(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::SELF_ASSESSMENT);
        [$client, $accessToken] = $this->loginAsEmployee($client);

        $client->request('GET', '/api/v1/appraisals/'.$appraisal->getId().'/deliverables/', server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(403);
    }

    public function testAppraiseeCreatesKdDuringSelfAssessment(): void
    {
        $client = static::createClient();
        $perspective = BscPerspectiveFactory::new()->create(['weightCap' => '0.5000', 'maxKdCount' => 5]);
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::SELF_ASSESSMENT);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/deliverables/', server: $this->authHeader($accessToken), content: json_encode([
            'description' => 'Ship the widget',
            'weight' => '0.3',
            'perspective' => (string) $perspective->getId(),
        ]));

        self::assertResponseStatusCodeSame(201);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('Ship the widget', $body['description']);
        self::assertSame($this->perspectiveKey($perspective), $body['perspective']);
        self::assertNull($body['weighted_score']);
    }

    public function testAppraiseeCannotCreateKdOutsideSelfAssessment(): void
    {
        $client = static::createClient();
        $perspective = BscPerspectiveFactory::new()->create();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::MANAGER_REVIEW);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/deliverables/', server: $this->authHeader($accessToken), content: json_encode([
            'description' => 'Too late',
            'weight' => '0.3',
            'perspective' => (string) $perspective->getId(),
        ]));

        self::assertResponseStatusCodeSame(403);
    }

    public function testCreateRejectsInvalidPerspective(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::SELF_ASSESSMENT);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/deliverables/', server: $this->authHeader($accessToken), content: json_encode([
            'description' => 'X',
            'weight' => '0.3',
            'perspective' => 'NOT_A_PERSPECTIVE',
        ]));

        self::assertResponseStatusCodeSame(400);
        $fields = array_column(json_decode($client->getResponse()->getContent(), true)['data']['errors'], 'field');
        self::assertContains('perspective', $fields);
    }

    public function testCreateRejectsWeightCapExceededForPerspective(): void
    {
        $client = static::createClient();
        $perspective = BscPerspectiveFactory::new()->create(['weightCap' => '0.3000', 'maxKdCount' => 10]);
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::SELF_ASSESSMENT);
        KeyDeliverableFactory::new()->create(['appraisal' => $appraisal, 'perspective' => $perspective, 'weight' => '0.2000']);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/deliverables/', server: $this->authHeader($accessToken), content: json_encode([
            'description' => 'Over cap',
            'weight' => '0.2',
            'perspective' => (string) $perspective->getId(),
        ]));

        self::assertResponseStatusCodeSame(400);
        self::assertStringContainsString('Weight cap exceeded', json_decode($client->getResponse()->getContent(), true)['data']['detail']);
    }

    public function testCreateRejectsMaxKdCountExceeded(): void
    {
        $client = static::createClient();
        $perspective = BscPerspectiveFactory::new()->create(['weightCap' => '0.9000', 'maxKdCount' => 1]);
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::SELF_ASSESSMENT);
        KeyDeliverableFactory::new()->create(['appraisal' => $appraisal, 'perspective' => $perspective, 'weight' => '0.1000']);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/deliverables/', server: $this->authHeader($accessToken), content: json_encode([
            'description' => 'Second one',
            'weight' => '0.1',
            'perspective' => (string) $perspective->getId(),
        ]));

        self::assertResponseStatusCodeSame(400);
        self::assertStringContainsString('Maximum of 1 key deliverables', json_decode($client->getResponse()->getContent(), true)['data']['detail']);
    }

    public function testCreateRejectsTotalWeightOver100PercentWhenNoPerspectiveCap(): void
    {
        $client = static::createClient();
        $perspective = BscPerspectiveFactory::new()->create(['weightCapMgr' => null, 'maxKdCountMgr' => null]);
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::SELF_ASSESSMENT, AppraisalFormType::FORM_A);
        KeyDeliverableFactory::new()->create(['appraisal' => $appraisal, 'perspective' => $perspective, 'weight' => '0.8000']);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/deliverables/', server: $this->authHeader($accessToken), content: json_encode([
            'description' => 'Pushes over 100%',
            'weight' => '0.3',
            'perspective' => (string) $perspective->getId(),
        ]));

        self::assertResponseStatusCodeSame(400);
        self::assertStringContainsString('cannot exceed 100%', json_decode($client->getResponse()->getContent(), true)['data']['detail']);
    }

    public function testManagerRatingUpdateTriggersScoreRecompute(): void
    {
        $client = static::createClient();
        $perspective = BscPerspectiveFactory::new()->create(['weightCap' => '1.0000']);
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::MANAGER_REVIEW);
        $kd = KeyDeliverableFactory::new()->create(['appraisal' => $appraisal, 'perspective' => $perspective, 'weight' => '1.0000']);
        [$client, $accessToken] = $this->loginAsManagerOf($client, $appraisal);

        $client->request('PATCH', '/api/v1/appraisals/'.$appraisal->getId().'/deliverables/'.$kd->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'manager_rating' => '4.0',
        ]));

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('4.0000', $body['weighted_score']);
    }

    public function testManagerCannotEditDescriptionOutsideFullCrudMode(): void
    {
        $client = static::createClient();
        $perspective = BscPerspectiveFactory::new()->create();
        // self_rating_enabled=true cycle -> manager never gets full KD CRUD.
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::MANAGER_REVIEW, selfRatingEnabled: true);
        $kd = KeyDeliverableFactory::new()->create(['appraisal' => $appraisal, 'perspective' => $perspective, 'weight' => '0.5000']);
        [$client, $accessToken] = $this->loginAsManagerOf($client, $appraisal);

        $client->request('PATCH', '/api/v1/appraisals/'.$appraisal->getId().'/deliverables/'.$kd->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'description' => 'Manager should not be able to set this',
        ]));

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertNotSame('Manager should not be able to set this', $body['description']);
    }

    public function testManagerGetsFullKdCrudWhenSelfRatingDisabled(): void
    {
        $client = static::createClient();
        $perspective = BscPerspectiveFactory::new()->create(['weightCap' => '1.0000', 'maxKdCount' => 5]);
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::MANAGER_REVIEW, selfRatingEnabled: false);
        [$client, $accessToken] = $this->loginAsManagerOf($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/deliverables/', server: $this->authHeader($accessToken), content: json_encode([
            'description' => 'Manager-authored KD',
            'weight' => '0.4',
            'perspective' => (string) $perspective->getId(),
            'manager_rating' => '3.0',
        ]));

        self::assertResponseStatusCodeSame(201);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('Manager-authored KD', $body['description']);
        self::assertSame('1.2000', $body['weighted_score']);
    }

    public function testAppraiseeDeletesKdDuringSelfAssessment(): void
    {
        $client = static::createClient();
        $perspective = BscPerspectiveFactory::new()->create();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::SELF_ASSESSMENT);
        $kd = KeyDeliverableFactory::new()->create(['appraisal' => $appraisal, 'perspective' => $perspective]);
        $kdId = (string) $kd->getId();
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('DELETE', '/api/v1/appraisals/'.$appraisal->getId().'/deliverables/'.$kdId.'/', server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(204);

        $client->request('GET', '/api/v1/appraisals/'.$appraisal->getId().'/deliverables/', server: $this->authHeader($accessToken));
        self::assertSame(0, json_decode($client->getResponse()->getContent(), true)['meta']['pagination']['count']);
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
    private function loginAsEmployee(KernelBrowser $client): array
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

    private function makeAppraisal(
        KernelBrowser $client,
        AppraisalStatus $status,
        AppraisalFormType $formType = AppraisalFormType::FORM_B,
        bool $selfRatingEnabled = true,
    ): Appraisal {
        $managerEmployee = EmployeeFactory::new()->managerial()->create();
        $managerEmployee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::MANAGER]));

        $employeeFactory = $formType === AppraisalFormType::FORM_A
            ? EmployeeFactory::new()->managerial()
            : EmployeeFactory::new();
        $employee = $employeeFactory->withManager($managerEmployee)->create();
        $employee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));

        $cycle = AppraisalCycleFactory::new()->active()->create(['selfRatingEnabled' => $selfRatingEnabled]);

        $appraisal = AppraisalFactory::new()->create([
            'cycle' => $cycle,
            'employee' => $employee,
            'formType' => $formType,
            'status' => $status,
        ]);

        static::getContainer()->get(EntityManagerInterface::class)->flush();

        return $appraisal;
    }

    private function perspectiveKey(BscPerspective $perspective): string
    {
        return static::getContainer()->get(PerspectiveKeyResolver::class)->toKey($perspective);
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
