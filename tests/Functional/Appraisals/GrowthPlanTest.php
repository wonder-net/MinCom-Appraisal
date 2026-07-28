<?php

declare(strict_types=1);

namespace App\Tests\Functional\Appraisals;

use App\Entity\Appraisal;
use App\Entity\CareerPlan;
use App\Entity\DevelopmentNeed;
use App\Entity\Employee;
use App\Entity\GrowthPlan;
use App\Entity\StrengthWeakness;
use App\Entity\TrainingNeed;
use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Enum\GrowthPlanPriority;
use App\Enum\RoleName;
use App\Enum\StrengthWeaknessType;
use App\Enum\TrainingNeedPriority;
use App\Enum\TrainingNeedType;
use App\Factory\AppraisalCycleFactory;
use App\Factory\AppraisalFactory;
use App\Factory\EmployeeFactory;
use App\Factory\RoleFactory;
use App\Factory\UserFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Port of apps.growth_plans.tests.test_views's core coverage:
 * retrieve/create/partial_update RBAC, status guard, upsert semantics,
 * atomic child replacement, blank-placeholder filtering, and
 * training-need priority-uniqueness validation. Audit-log assertions
 * are omitted (the `audit` app isn't ported yet).
 */
final class GrowthPlanTest extends WebTestCase
{
    public function testManagerCanRetrieveGrowthPlan(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeAppraisal();
        $this->makeGrowthPlan($appraisal);
        [$client, $token] = $this->loginAsManagerOf($client, $appraisal);

        $client->request('GET', '/api/v1/appraisals/'.$appraisal->getId().'/growth-plan/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame((string) $appraisal->getId(), $body['appraisal_id']);
        self::assertCount(1, $body['strengths_weaknesses']);
        self::assertCount(1, $body['training_needs']);
        self::assertCount(1, $body['career_plans']);
        self::assertCount(1, $body['development_needs']);
    }

    public function testAppraiseeCanRetrieveButNotWrite(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeAppraisal();
        $this->makeGrowthPlan($appraisal);
        [$client, $token] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('GET', '/api/v1/appraisals/'.$appraisal->getId().'/growth-plan/', server: $this->authHeader($token));
        self::assertResponseStatusCodeSame(200);

        $client->request('PATCH', '/api/v1/appraisals/'.$appraisal->getId().'/growth-plan/', server: $this->authHeader($token), content: json_encode(['overall_assessment' => 'nope']));
        self::assertResponseStatusCodeSame(403);
    }

    public function testUnrelatedEmployeeCannotRetrieve(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeAppraisal();
        $this->makeGrowthPlan($appraisal);
        $unrelated = EmployeeFactory::new()->create();
        $unrelated->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));
        static::getContainer()->get(EntityManagerInterface::class)->flush();
        [$client, $token] = $this->login($unrelated->getUser(), $client);

        $client->request('GET', '/api/v1/appraisals/'.$appraisal->getId().'/growth-plan/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(403);
    }

    public function testHrOfficerCanReadButNotWrite(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeAppraisal();
        $this->makeGrowthPlan($appraisal);
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_OFFICER);

        $client->request('GET', '/api/v1/appraisals/'.$appraisal->getId().'/growth-plan/', server: $this->authHeader($token));
        self::assertResponseStatusCodeSame(200);

        $client->request('PATCH', '/api/v1/appraisals/'.$appraisal->getId().'/growth-plan/', server: $this->authHeader($token), content: json_encode(['overall_assessment' => 'nope']));
        self::assertResponseStatusCodeSame(403);
    }

    public function testRetrieveMissingGrowthPlanReturns404(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeAppraisal();
        [$client, $token] = $this->loginAsManagerOf($client, $appraisal);

        $client->request('GET', '/api/v1/appraisals/'.$appraisal->getId().'/growth-plan/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(404);
    }

    public function testRetrieveNonexistentAppraisalReturns404(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);

        $client->request('GET', '/api/v1/appraisals/'.\Symfony\Component\Uid\Uuid::v7().'/growth-plan/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(404);
    }

    public function testManagerCreatesGrowthPlanReturns201(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeAppraisal();
        [$client, $token] = $this->loginAsManagerOf($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/growth-plan/', server: $this->authHeader($token), content: json_encode($this->samplePostBody()));

        self::assertResponseStatusCodeSame(201);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('Doing well overall.', $body['overall_assessment']);
        self::assertCount(1, $body['strengths_weaknesses']);
        self::assertCount(1, $body['training_needs']);
    }

    public function testPostUpsertsExistingPlanReturns200AndReplacesChildren(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeAppraisal();
        $this->makeGrowthPlan($appraisal);
        [$client, $token] = $this->loginAsManagerOf($client, $appraisal);

        $newBody = $this->samplePostBody();
        $newBody['overall_assessment'] = 'Updated assessment.';
        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/growth-plan/', server: $this->authHeader($token), content: json_encode($newBody));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('Updated assessment.', $body['overall_assessment']);
        // POST replaces ALL children — career_plans/development_needs
        // were NOT included in samplePostBody(), so they get wiped.
        self::assertSame([], $body['career_plans']);
        self::assertSame([], $body['development_needs']);
    }

    public function testPatchOnlyTouchesProvidedKeys(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeAppraisal();
        $this->makeGrowthPlan($appraisal);
        [$client, $token] = $this->loginAsManagerOf($client, $appraisal);

        $client->request('PATCH', '/api/v1/appraisals/'.$appraisal->getId().'/growth-plan/', server: $this->authHeader($token), content: json_encode([
            'career_plans' => [['aspired_role' => 'VP Engineering', 'priority' => 'FIRST']],
        ]));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertCount(1, $body['career_plans']);
        self::assertSame('VP Engineering', $body['career_plans'][0]['aspired_role']);
        // Untouched arrays retain their original seeded content.
        self::assertCount(1, $body['strengths_weaknesses']);
        self::assertCount(1, $body['training_needs']);
        self::assertCount(1, $body['development_needs']);
    }

    public function testPatchMissingGrowthPlanReturns404(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeAppraisal();
        [$client, $token] = $this->loginAsManagerOf($client, $appraisal);

        $client->request('PATCH', '/api/v1/appraisals/'.$appraisal->getId().'/growth-plan/', server: $this->authHeader($token), content: json_encode(['overall_assessment' => 'x']));

        self::assertResponseStatusCodeSame(404);
    }

    public function testWriteBlockedOutsideGrowthPlanningStatus(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeAppraisal(AppraisalStatus::DISCUSSION);
        [$client, $token] = $this->loginAsManagerOf($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/growth-plan/', server: $this->authHeader($token), content: json_encode($this->samplePostBody()));

        self::assertResponseStatusCodeSame(403);
    }

    public function testDuplicateTrainingNeedPriorityWithinTypeReturns400(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeAppraisal();
        [$client, $token] = $this->loginAsManagerOf($client, $appraisal);

        $body = $this->samplePostBody();
        $body['training_needs'] = [
            ['type' => 'ON_THE_JOB', 'description' => 'First', 'priority' => 'FIRST'],
            ['type' => 'ON_THE_JOB', 'description' => 'Second', 'priority' => 'FIRST'],
        ];
        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/growth-plan/', server: $this->authHeader($token), content: json_encode($body));

        self::assertResponseStatusCodeSame(400);
    }

    public function testDifferentTypesSamePriorityIsValid(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeAppraisal();
        [$client, $token] = $this->loginAsManagerOf($client, $appraisal);

        $body = $this->samplePostBody();
        $body['training_needs'] = [
            ['type' => 'ON_THE_JOB', 'description' => 'OTJ', 'priority' => 'FIRST'],
            ['type' => 'RECOMMENDED_COURSE', 'description' => 'Course', 'priority' => 'FIRST'],
        ];
        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/growth-plan/', server: $this->authHeader($token), content: json_encode($body));

        self::assertResponseStatusCodeSame(201);
    }

    public function testBlankPlaceholderRowsAreSilentlyDropped(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeAppraisal();
        [$client, $token] = $this->loginAsManagerOf($client, $appraisal);

        $body = $this->samplePostBody();
        $body['strengths_weaknesses'][] = ['type' => 'STRENGTH', 'description' => '   ', 'sort_order' => 1];
        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/growth-plan/', server: $this->authHeader($token), content: json_encode($body));

        self::assertResponseStatusCodeSame(201);
        $responseBody = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertCount(1, $responseBody['strengths_weaknesses']);
    }

    public function testPostThenGetReturnsSameStructure(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeAppraisal();
        [$client, $token] = $this->loginAsManagerOf($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/growth-plan/', server: $this->authHeader($token), content: json_encode($this->samplePostBody()));
        self::assertResponseStatusCodeSame(201);
        $postBody = json_decode($client->getResponse()->getContent(), true)['data'];

        $client->request('GET', '/api/v1/appraisals/'.$appraisal->getId().'/growth-plan/', server: $this->authHeader($token));
        self::assertResponseStatusCodeSame(200);
        $getBody = json_decode($client->getResponse()->getContent(), true)['data'];

        self::assertSame($postBody, $getBody);
    }

    public function testEscalatedExecutiveCanWriteAndOriginalManagerCannot(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal, 'managerEmployee' => $managerEmployee] = $this->makeAppraisal();
        $executive = UserFactory::new()->withRoles(RoleName::EXECUTIVE)->create();
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        $em = static::getContainer()->get(EntityManagerInterface::class);
        $freshAppraisal = $em->getRepository(Appraisal::class)->find($appraisal->getId());
        \assert($freshAppraisal instanceof Appraisal);
        $freshAppraisal->setEscalatedExecutive($executive);
        $em->flush();

        [$client, $execToken] = $this->login($executive, $client);
        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/growth-plan/', server: $this->authHeader($execToken), content: json_encode($this->samplePostBody()));
        self::assertResponseStatusCodeSame(201);

        $managerUserId = (string) $managerEmployee->getUser()->getId();
        $managerUser = $em->getRepository(User::class)->find($managerUserId);
        \assert($managerUser instanceof User);
        [$client, $managerToken] = $this->login($managerUser, $client);
        $client->request('PATCH', '/api/v1/appraisals/'.$appraisal->getId().'/growth-plan/', server: $this->authHeader($managerToken), content: json_encode(['overall_assessment' => 'blocked']));
        self::assertResponseStatusCodeSame(403);

        // Original manager retains read access post-escalation.
        $client->request('GET', '/api/v1/appraisals/'.$appraisal->getId().'/growth-plan/', server: $this->authHeader($managerToken));
        self::assertResponseStatusCodeSame(200);
    }

    /**
     * @return array<string, mixed>
     */
    private function samplePostBody(): array
    {
        return [
            'overall_assessment' => 'Doing well overall.',
            'strengths_weaknesses' => [
                ['type' => 'STRENGTH', 'description' => 'Strong technical skills', 'sort_order' => 1],
            ],
            'training_needs' => [
                ['type' => 'ON_THE_JOB', 'description' => 'Shadow a senior engineer', 'priority' => 'FIRST'],
            ],
        ];
    }

    /**
     * @return array{appraisal: Appraisal, managerEmployee: Employee}
     */
    private function makeAppraisal(AppraisalStatus $status = AppraisalStatus::GROWTH_PLANNING): array
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

    private function makeGrowthPlan(Appraisal $appraisal): GrowthPlan
    {
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $gp = new GrowthPlan($appraisal, 'Initial assessment.');
        $em->persist($gp);
        $em->persist(new StrengthWeakness($gp, StrengthWeaknessType::STRENGTH, 'Strong technical skills'));
        $em->persist(new TrainingNeed($gp, TrainingNeedType::ON_THE_JOB, 'Shadow a senior engineer', TrainingNeedPriority::FIRST));
        $em->persist(new CareerPlan($gp, 'Engineering Director', 'FIRST'));
        $em->persist(new DevelopmentNeed($gp, 'Improve public speaking', GrowthPlanPriority::FIRST));
        $em->flush();

        return $gp;
    }

    /**
     * @return array{0: KernelBrowser, 1: string}
     */
    private function loginAsManagerOf(KernelBrowser $client, Appraisal $appraisal): array
    {
        $manager = $appraisal->getEmployee()->getManager();
        \assert($manager instanceof Employee);

        return $this->login($manager->getUser(), $client);
    }

    /**
     * @return array{0: KernelBrowser, 1: string}
     */
    private function loginAsAppraisee(KernelBrowser $client, Appraisal $appraisal): array
    {
        return $this->login($appraisal->getEmployee()->getUser(), $client);
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
     * Re-fetches by id via the current container's EntityManager before
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
