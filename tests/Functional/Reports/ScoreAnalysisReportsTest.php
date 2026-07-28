<?php

declare(strict_types=1);

namespace App\Tests\Functional\Reports;

use App\Entity\CompetencyRating;
use App\Entity\KeyDeliverable;
use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Enum\RoleName;
use App\Factory\AppraisalCycleFactory;
use App\Factory\AppraisalFactory;
use App\Factory\BscPerspectiveFactory;
use App\Factory\CompetencyFactory;
use App\Factory\ScoreDescriptorFactory;
use App\Factory\UserFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.reports.tests' coverage for Milestone 13b: Score
 * Distribution, BSC Perspective Breakdown, Competency Gap, and
 * Self-vs-Manager Variance reports. Covers RBAC (including
 * CompetencyGapReportView's IsHRStaff-only, no-EXECUTIVE carve-out),
 * aggregation correctness, zero/empty-state handling, and
 * department_id/form_type param validation errors.
 */
final class ScoreAnalysisReportsTest extends WebTestCase
{
    public function testScoreDistributionRequiresHrStaffOrExecutive(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::EMPLOYEE);

        $client->request('GET', '/api/v1/reports/score-distribution/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(403);
    }

    public function testScoreDistributionReturnsZeroStateWhenNoActiveCycle(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);

        $client->request('GET', '/api/v1/reports/score-distribution/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertNull($body['cycle_id']);
        self::assertSame(0, $body['total']);
        self::assertSame([], $body['bands']);
    }

    public function testScoreDistributionAggregatesFinalisedByDescriptorBand(): void
    {
        $client = static::createClient();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $cycle = AppraisalCycleFactory::new()->active()->create();

        ScoreDescriptorFactory::new()->create(['cycle' => $cycle, 'kdLabel' => 'Exceeds', 'sortOrder' => 1]);
        ScoreDescriptorFactory::new()->create(['cycle' => $cycle, 'kdLabel' => 'Meets', 'sortOrder' => 2]);

        AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::FINALISED, 'performanceDescriptor' => 'Meets']);
        AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::FINALISED, 'performanceDescriptor' => 'Meets']);
        AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::FINALISED, 'performanceDescriptor' => 'Exceeds']);
        // Non-FINALISED must not count.
        AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::DISCUSSION, 'performanceDescriptor' => 'Exceeds']);

        $em->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/score-distribution/?cycle_id='.$cycle->getId(), server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame(3, $body['total']);
        $byLabel = array_column($body['bands'], null, 'label');
        self::assertSame(1, $byLabel['Exceeds']['count']);
        self::assertSame(2, $byLabel['Meets']['count']);
        // 1/3 = 33.33%.
        self::assertSame('33.33', (string) $byLabel['Exceeds']['percentage']);
        self::assertSame('66.67', (string) $byLabel['Meets']['percentage']);
    }

    public function testScoreDistributionInvalidDepartmentIdReturns400(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);

        $client->request('GET', '/api/v1/reports/score-distribution/?department_id=not-a-uuid', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(400);
    }

    public function testScoreDistributionNonexistentDepartmentIdReturns404(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);

        $client->request('GET', '/api/v1/reports/score-distribution/?department_id='.Uuid::v7(), server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(404);
    }

    public function testScoreDistributionInvalidFormTypeReturns400(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);

        $client->request('GET', '/api/v1/reports/score-distribution/?form_type=BOGUS', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(400);
    }

    public function testBscPerspectiveBreakdownAggregatesAvgWeightedScore(): void
    {
        $client = static::createClient();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $perspective = BscPerspectiveFactory::new()->create();

        $a1 = AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::FINALISED]);
        $kd1 = new KeyDeliverable($a1, $perspective, 'KD 1', '0.5000');
        $kd1->setWeightedScore('4.0000');
        $em->persist($kd1);

        $a2 = AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::FINALISED]);
        $kd2 = new KeyDeliverable($a2, $perspective, 'KD 2', '0.5000');
        $kd2->setWeightedScore('2.0000');
        $em->persist($kd2);

        $em->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/bsc-perspectives/?cycle_id='.$cycle->getId(), server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertCount(1, $body['perspectives']);
        self::assertSame((string) $perspective->getId(), $body['perspectives'][0]['perspective_id']);
        self::assertSame('3', (string) (float) $body['perspectives'][0]['avg_weighted_score']);
        self::assertSame(2, $body['perspectives'][0]['appraisal_count']);
    }

    public function testCompetencyGapRequiresHrStaffButNotExecutive(): void
    {
        $client = static::createClient();
        [$client, $execToken] = $this->loginAsRole($client, RoleName::EXECUTIVE);
        $client->request('GET', '/api/v1/reports/competency-gaps/', server: $this->authHeader($execToken));
        self::assertResponseStatusCodeSame(403);

        [$client, $hrToken] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/competency-gaps/', server: $this->authHeader($hrToken));
        self::assertResponseStatusCodeSame(200);
    }

    public function testCompetencyGapOrdersByAvgManagerRatingAscending(): void
    {
        $client = static::createClient();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $lowRated = CompetencyFactory::new()->create(['name' => 'Low Rated']);
        $highRated = CompetencyFactory::new()->create(['name' => 'High Rated']);

        $a1 = AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::FINALISED]);
        $r1 = new CompetencyRating($a1, $lowRated);
        $r1->setManagerRating('2.00');
        $em->persist($r1);

        $a2 = AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::FINALISED]);
        $r2 = new CompetencyRating($a2, $highRated);
        $r2->setManagerRating('4.00');
        $em->persist($r2);

        $em->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/competency-gaps/?cycle_id='.$cycle->getId(), server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertCount(2, $body['gaps']);
        self::assertSame('Low Rated', $body['gaps'][0]['competency_name']);
        self::assertSame('High Rated', $body['gaps'][1]['competency_name']);
    }

    public function testVarianceReturnsEmptyWhenSelfRatingDisabled(): void
    {
        $client = static::createClient();
        $cycle = AppraisalCycleFactory::new()->active()->create(['selfRatingEnabled' => false]);
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/variance/?cycle_id='.$cycle->getId(), server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertFalse($body['self_rating_enabled']);
        self::assertSame([], $body['kd_variances']);
        self::assertSame([], $body['competency_variances']);
    }

    public function testVarianceComputesKdAndCompetencyGaps(): void
    {
        $client = static::createClient();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $cycle = AppraisalCycleFactory::new()->active()->create(['selfRatingEnabled' => true]);
        $perspective = BscPerspectiveFactory::new()->create();
        $competency = CompetencyFactory::new()->create();

        $appraisal = AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::FINALISED]);

        $kd = new KeyDeliverable($appraisal, $perspective, 'KD', '1.0000');
        $kd->setSelfRating('4.00');
        $kd->setManagerRating('3.00');
        $em->persist($kd);

        $rating = new CompetencyRating($appraisal, $competency);
        $rating->setSelfRating('3.00');
        $rating->setManagerRating('4.00');
        $em->persist($rating);

        $em->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/variance/?cycle_id='.$cycle->getId(), server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertTrue($body['self_rating_enabled']);
        self::assertCount(1, $body['kd_variances']);
        self::assertSame($perspective->getName(), $body['kd_variances'][0]['kd_title']);
        self::assertSame('1', (string) (float) $body['kd_variances'][0]['variance']);
        self::assertCount(1, $body['competency_variances']);
        self::assertSame('-1', (string) (float) $body['competency_variances'][0]['variance']);
    }

    public function testVarianceInvalidDepartmentIdReturns400(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);

        $client->request('GET', '/api/v1/reports/variance/?department_id=not-a-uuid', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(400);
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
