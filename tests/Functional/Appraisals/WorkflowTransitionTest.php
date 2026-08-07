<?php

declare(strict_types=1);

namespace App\Tests\Functional\Appraisals;

use App\Entity\Appraisal;
use App\Entity\Comment;
use App\Entity\CompetencyRating;
use App\Entity\Employee;
use App\Entity\User;
use App\Enum\AppraisalPartyRole;
use App\Enum\AppraisalStatus;
use App\Enum\RoleName;
use App\Factory\AppraisalCycleFactory;
use App\Factory\AppraisalFactory;
use App\Factory\BscPerspectiveFactory;
use App\Factory\CompetencyFactory;
use App\Factory\EmployeeFactory;
use App\Factory\KeyDeliverableFactory;
use App\Factory\RoleFactory;
use App\Factory\UserFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class WorkflowTransitionTest extends WebTestCase
{
    public function testAppraiseeSubmitsSelfAssessmentWhenComplete(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::SELF_ASSESSMENT);
        $perspective = BscPerspectiveFactory::new()->create(['weightCap' => '1.0000']);
        KeyDeliverableFactory::new()->create(['appraisal' => $appraisal, 'perspective' => $perspective, 'weight' => '1.0000', 'selfRating' => '4.00']);
        $rating = $this->addRating($appraisal, '4.00', null);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/transition/', server: $this->authHeader($accessToken), content: json_encode([
            'to_status' => 'MANAGER_REVIEW',
            'version' => 1,
        ]));

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('MANAGER_REVIEW', $body['status']);
        self::assertSame('SELF_ASSESSMENT', $body['previous_status']);
        self::assertSame(2, $body['version']);
    }

    public function testSubmitRejectedWhenKdWeightsDontSumToOne(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::SELF_ASSESSMENT);
        $perspective = BscPerspectiveFactory::new()->create(['weightCap' => '1.0000']);
        KeyDeliverableFactory::new()->create(['appraisal' => $appraisal, 'perspective' => $perspective, 'weight' => '0.5000', 'selfRating' => '4.00']);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/transition/', server: $this->authHeader($accessToken), content: json_encode([
            'to_status' => 'MANAGER_REVIEW',
            'version' => 1,
        ]));

        self::assertResponseStatusCodeSame(400);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('GUARD_FAILED', $body['code']);
        self::assertStringContainsString('100%', $body['detail']);
    }

    public function testSubmitRejectedWhenNoKeyDeliverables(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::SELF_ASSESSMENT);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/transition/', server: $this->authHeader($accessToken), content: json_encode([
            'to_status' => 'MANAGER_REVIEW',
            'version' => 1,
        ]));

        self::assertResponseStatusCodeSame(400);
        self::assertSame('No key deliverables exist for this appraisal.', json_decode($client->getResponse()->getContent(), true)['data']['detail']);
    }

    public function testManagerCannotSubmitAppraiseesSelfAssessment(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::SELF_ASSESSMENT);
        $perspective = BscPerspectiveFactory::new()->create(['weightCap' => '1.0000']);
        KeyDeliverableFactory::new()->create(['appraisal' => $appraisal, 'perspective' => $perspective, 'weight' => '1.0000', 'selfRating' => '4.00']);
        [$client, $accessToken] = $this->loginAsManagerOf($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/transition/', server: $this->authHeader($accessToken), content: json_encode([
            'to_status' => 'MANAGER_REVIEW',
            'version' => 1,
        ]));

        self::assertResponseStatusCodeSame(403);
    }

    public function testStaleVersionReturns409(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::SELF_ASSESSMENT);
        $perspective = BscPerspectiveFactory::new()->create(['weightCap' => '1.0000']);
        KeyDeliverableFactory::new()->create(['appraisal' => $appraisal, 'perspective' => $perspective, 'weight' => '1.0000', 'selfRating' => '4.00']);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/transition/', server: $this->authHeader($accessToken), content: json_encode([
            'to_status' => 'MANAGER_REVIEW',
            'version' => 99,
        ]));

        self::assertResponseStatusCodeSame(409);
    }

    public function testInvalidTransitionReturns400(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::SELF_ASSESSMENT);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/transition/', server: $this->authHeader($accessToken), content: json_encode([
            'to_status' => 'SIGNED_OFF',
            'version' => 1,
        ]));

        self::assertResponseStatusCodeSame(400);
        self::assertSame('INVALID_TRANSITION', json_decode($client->getResponse()->getContent(), true)['data']['code']);
    }

    public function testManagerReviewToDiscussionRequiresAllManagerRatings(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::MANAGER_REVIEW);
        $perspective = BscPerspectiveFactory::new()->create(['weightCap' => '1.0000']);
        KeyDeliverableFactory::new()->create(['appraisal' => $appraisal, 'perspective' => $perspective, 'weight' => '1.0000']);
        $this->addRating($appraisal, null, null);
        [$client, $accessToken] = $this->loginAsManagerOf($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/transition/', server: $this->authHeader($accessToken), content: json_encode([
            'to_status' => 'DISCUSSION',
            'version' => 1,
        ]));

        self::assertResponseStatusCodeSame(400);
        self::assertStringContainsString('missing manager rating', json_decode($client->getResponse()->getContent(), true)['data']['detail']);
    }

    public function testManagerReviewToDiscussionSucceedsAndComputesScores(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::MANAGER_REVIEW);
        $perspective = BscPerspectiveFactory::new()->create(['weightCap' => '1.0000']);
        KeyDeliverableFactory::new()->create(['appraisal' => $appraisal, 'perspective' => $perspective, 'weight' => '1.0000', 'managerRating' => '4.00']);
        $this->addRating($appraisal, null, '4.00');
        [$client, $accessToken] = $this->loginAsManagerOf($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/transition/', server: $this->authHeader($accessToken), content: json_encode([
            'to_status' => 'DISCUSSION',
            'version' => 1,
        ]));

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('DISCUSSION', $body['status']);
        // Post-rescale (HR change requests #8/#9): total = kdAvg/5*70 +
        // bcPoints = (4.00/5*70) + 4.00 = 56.00 + 4.00 = 60.00 — see
        // ScoreEngine and the equivalent comment in CompetencyRatingTest.
        self::assertSame('60.00', $body['total_score']);
    }

    public function testDiscussionToGrowthPlanningRequiresBothPartyComments(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::DISCUSSION);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/transition/', server: $this->authHeader($accessToken), content: json_encode([
            'to_status' => 'GROWTH_PLANNING',
            'version' => 1,
        ]));

        self::assertResponseStatusCodeSame(400);
        $detail = json_decode($client->getResponse()->getContent(), true)['data']['detail'];
        self::assertStringContainsString('appraisee and appraisor', $detail);
    }

    public function testDiscussionToGrowthPlanningSucceedsWithBothComments(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::DISCUSSION);
        $this->addComment($appraisal, AppraisalPartyRole::APPRAISEE, $appraisal->getEmployee()->getUser());
        $manager = $appraisal->getEmployee()->getManager();
        \assert($manager instanceof Employee);
        $this->addComment($appraisal, AppraisalPartyRole::APPRAISER, $manager->getUser());
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/transition/', server: $this->authHeader($accessToken), content: json_encode([
            'to_status' => 'GROWTH_PLANNING',
            'version' => 1,
        ]));

        self::assertResponseIsSuccessful();
        self::assertSame('GROWTH_PLANNING', json_decode($client->getResponse()->getContent(), true)['data']['status']);
    }

    public function testGrowthPlanningToPendingSignoffSucceedsWithCompleteGrowthPlan(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::GROWTH_PLANNING);
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $growthPlan = new \App\Entity\GrowthPlan($appraisal);
        $em->persist($growthPlan);
        $em->persist(new \App\Entity\StrengthWeakness($growthPlan, \App\Enum\StrengthWeaknessType::STRENGTH, 'Strong technical skills'));
        $em->persist(new \App\Entity\StrengthWeakness($growthPlan, \App\Enum\StrengthWeaknessType::WEAKNESS, 'Time management'));
        $em->persist(new \App\Entity\TrainingNeed($growthPlan, \App\Enum\TrainingNeedType::ON_THE_JOB, 'Shadow a senior engineer', \App\Enum\TrainingNeedPriority::FIRST));
        $em->flush();
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/transition/', server: $this->authHeader($accessToken), content: json_encode([
            'to_status' => 'PENDING_SIGNOFF',
            'version' => 1,
        ]));

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('PENDING_SIGNOFF', $body['status']);
        self::assertSame(1, $body['signing_round']);
    }

    public function testGrowthPlanningToPendingSignoffBlockedWithoutGrowthPlan(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::GROWTH_PLANNING);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/transition/', server: $this->authHeader($accessToken), content: json_encode([
            'to_status' => 'PENDING_SIGNOFF',
            'version' => 1,
        ]));

        self::assertResponseStatusCodeSame(400);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('GUARD_FAILED', $body['code']);
        self::assertStringContainsString('at least one strength', $body['detail']);
        self::assertStringContainsString('at least one weakness', $body['detail']);
        self::assertStringContainsString('at least one training need', $body['detail']);
    }

    public function testHrAdminFinalisesSignedOffAppraisal(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::SIGNED_OFF);
        [$client, $accessToken] = $this->loginAsHrAdmin($client);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/transition/', server: $this->authHeader($accessToken), content: json_encode([
            'to_status' => 'FINALISED',
            'version' => 1,
        ]));

        self::assertResponseIsSuccessful();
        self::assertSame('FINALISED', json_decode($client->getResponse()->getContent(), true)['data']['status']);
    }

    public function testAppraiseeCannotFinalise(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::SIGNED_OFF);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/transition/', server: $this->authHeader($accessToken), content: json_encode([
            'to_status' => 'FINALISED',
            'version' => 1,
        ]));

        self::assertResponseStatusCodeSame(403);
    }

    public function testExcludeAndReincludeAppraisal(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::SELF_ASSESSMENT);
        [$client, $accessToken] = $this->loginAsHrAdmin($client);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/exclude/', server: $this->authHeader($accessToken), content: json_encode([
            'reason' => 'Employee left the company.',
        ]));
        self::assertResponseIsSuccessful();
        self::assertSame('EXCLUDED', json_decode($client->getResponse()->getContent(), true)['data']['status']);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/reinclude/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        self::assertSame('SELF_ASSESSMENT', json_decode($client->getResponse()->getContent(), true)['data']['status']);
    }

    public function testExcludeRequiresReason(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::SELF_ASSESSMENT);
        [$client, $accessToken] = $this->loginAsHrAdmin($client);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/exclude/', server: $this->authHeader($accessToken), content: json_encode([]));
        self::assertResponseStatusCodeSame(400);
    }

    public function testNonAdminCannotExclude(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal(AppraisalStatus::SELF_ASSESSMENT);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/exclude/', server: $this->authHeader($accessToken), content: json_encode(['reason' => 'x']));
        self::assertResponseStatusCodeSame(403);
    }

    private function addRating(Appraisal $appraisal, ?string $selfRating, ?string $managerRating): CompetencyRating
    {
        $competency = CompetencyFactory::new()->create();
        $rating = new CompetencyRating($appraisal, $competency);
        if ($selfRating !== null) {
            $rating->setSelfRating($selfRating);
        }
        if ($managerRating !== null) {
            $rating->setManagerRating($managerRating);
        }
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->persist($rating);
        $em->flush();

        return $rating;
    }

    private function addComment(Appraisal $appraisal, AppraisalPartyRole $role, User $author): void
    {
        $comment = new Comment($appraisal, $author, $role, 'A comment.');
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->persist($comment);
        $em->flush();
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
        $manager = $appraisal->getEmployee()->getManager();
        \assert($manager instanceof Employee);
        $manager->getUser()->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        return $this->login($manager->getUser(), $client);
    }

    private function makeAppraisal(AppraisalStatus $status, bool $selfRatingEnabled = true): Appraisal
    {
        $managerEmployee = EmployeeFactory::new()->managerial()->create();
        $managerEmployee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::MANAGER]));

        $employee = EmployeeFactory::new()->withManager($managerEmployee)->create();
        $employee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));

        $cycle = AppraisalCycleFactory::new()->active()->create(['selfRatingEnabled' => $selfRatingEnabled]);

        $appraisal = AppraisalFactory::new()->create([
            'cycle' => $cycle,
            'employee' => $employee,
            'status' => $status,
        ]);
        // statusChangedAt is left null (its natural default on a freshly
        // created appraisal) — the DISCUSSION -> GROWTH_PLANNING guard's
        // "since" filter only applies when it's set, so comments added
        // within the same test are never excluded.

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
