<?php

declare(strict_types=1);

namespace App\Tests\Functional\Appraisals;

use App\Entity\Appraisal;
use App\Entity\CompetencyRating;
use App\Entity\Employee;
use App\Entity\SubCompetencyRating;
use App\Entity\User;
use App\Enum\AppraisalFormType;
use App\Enum\AppraisalStatus;
use App\Enum\RoleName;
use App\Factory\AppraisalCycleFactory;
use App\Factory\AppraisalFactory;
use App\Factory\CompetencyFactory;
use App\Factory\EmployeeFactory;
use App\Factory\RoleFactory;
use App\Factory\SubCompetencyFactory;
use App\Factory\UserFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class SubCompetencyRatingUpdateControllerTest extends WebTestCase
{
    public function testAppraiseeSetsSubCompetencySelfRatingDuringSelfAssessment(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::SELF_ASSESSMENT);
        ['rating' => $rating, 'subRatings' => $subRatings] = $this->addRatingWithSubCompetencies($appraisal, 2);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('PATCH', $this->url($appraisal, $rating, $subRatings[0]), server: $this->authHeader($accessToken), content: json_encode([
            'self_rating' => '1.5',
        ]));

        self::assertResponseIsSuccessful();
        self::assertSame('1.50', json_decode($client->getResponse()->getContent(), true)['data']['self_rating']);
    }

    public function testParentRatingStaysNullUntilAllSiblingsRated(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::MANAGER_REVIEW);
        ['rating' => $rating, 'subRatings' => $subRatings] = $this->addRatingWithSubCompetencies($appraisal, 3);
        [$client, $accessToken] = $this->loginAsManagerOf($client, $appraisal);

        $client->request('PATCH', $this->url($appraisal, $rating, $subRatings[0]), server: $this->authHeader($accessToken), content: json_encode([
            'manager_rating' => '1.0',
        ]));
        self::assertResponseIsSuccessful();

        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->clear();
        $refreshed = static::getContainer()->get(\App\Repository\CompetencyRatingRepository::class)->find($rating->getId());
        self::assertNull($refreshed->getManagerRating());
    }

    public function testParentRatingRollsUpToSumOnceAllSiblingsRated(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::MANAGER_REVIEW);
        ['rating' => $rating, 'subRatings' => $subRatings] = $this->addRatingWithSubCompetencies($appraisal, 3);
        [$client, $accessToken] = $this->loginAsManagerOf($client, $appraisal);

        foreach ($subRatings as $subRating) {
            $client->request('PATCH', $this->url($appraisal, $rating, $subRating), server: $this->authHeader($accessToken), content: json_encode([
                'manager_rating' => (string) $subRating->getMaxScore(),
            ]));
            self::assertResponseIsSuccessful();
        }

        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->clear();
        $refreshed = static::getContainer()->get(\App\Repository\CompetencyRatingRepository::class)->find($rating->getId());
        // Every sibling rated at its own max => parent sums to exactly 7.50.
        self::assertSame('7.50', $refreshed->getManagerRating());
    }

    public function testRatingAboveSubCompetencyMaxScoreRejected(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::MANAGER_REVIEW);
        ['rating' => $rating, 'subRatings' => $subRatings] = $this->addRatingWithSubCompetencies($appraisal, 2);
        [$client, $accessToken] = $this->loginAsManagerOf($client, $appraisal);

        $tooHigh = bcadd((string) $subRatings[0]->getMaxScore(), '0.01', 2);
        $client->request('PATCH', $this->url($appraisal, $rating, $subRatings[0]), server: $this->authHeader($accessToken), content: json_encode([
            'manager_rating' => $tooHigh,
        ]));

        self::assertResponseStatusCodeSame(400);
    }

    public function testNegativeRatingRejected(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::MANAGER_REVIEW);
        ['rating' => $rating, 'subRatings' => $subRatings] = $this->addRatingWithSubCompetencies($appraisal, 2);
        [$client, $accessToken] = $this->loginAsManagerOf($client, $appraisal);

        $client->request('PATCH', $this->url($appraisal, $rating, $subRatings[0]), server: $this->authHeader($accessToken), content: json_encode([
            'manager_rating' => '-0.5',
        ]));

        self::assertResponseStatusCodeSame(400);
    }

    public function testAppraiseeCannotRateOutsideSelfAssessment(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::DISCUSSION);
        ['rating' => $rating, 'subRatings' => $subRatings] = $this->addRatingWithSubCompetencies($appraisal, 2);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('PATCH', $this->url($appraisal, $rating, $subRatings[0]), server: $this->authHeader($accessToken), content: json_encode([
            'self_rating' => '1.0',
        ]));

        self::assertResponseStatusCodeSame(403);
    }

    public function testFullyRatingAllSubCompetenciesTriggersAppraisalScoreRecompute(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::MANAGER_REVIEW);
        ['rating' => $rating, 'subRatings' => $subRatings] = $this->addRatingWithSubCompetencies($appraisal, 3);
        [$client, $accessToken] = $this->loginAsManagerOf($client, $appraisal);

        foreach ($subRatings as $subRating) {
            $client->request('PATCH', $this->url($appraisal, $rating, $subRating), server: $this->authHeader($accessToken), content: json_encode([
                'manager_rating' => (string) $subRating->getMaxScore(),
            ]));
            self::assertResponseIsSuccessful();
        }

        $client->request('GET', '/api/v1/appraisals/'.$appraisal->getId().'/', server: $this->authHeader($accessToken));
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('7.50', $body['bc_average_score']);
    }

    /**
     * @return array{rating: CompetencyRating, subRatings: list<SubCompetencyRating>}
     */
    private function addRatingWithSubCompetencies(Appraisal $appraisal, int $count): array
    {
        $competency = CompetencyFactory::new()->create();
        $weights = (new \App\Service\SubCompetencyWeightCalculator())->computeShares($count);

        $rating = new CompetencyRating($appraisal, $competency);
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->persist($rating);

        $subRatings = [];
        for ($i = 0; $i < $count; ++$i) {
            $subCompetency = SubCompetencyFactory::new()->create(['competency' => $competency, 'sortOrder' => $i]);
            $subRating = new SubCompetencyRating($rating, $subCompetency, $subCompetency->getName(), $i, $weights[$i]);
            $em->persist($subRating);
            $subRatings[] = $subRating;
        }

        $em->flush();

        return ['rating' => $rating, 'subRatings' => $subRatings];
    }

    private function url(Appraisal $appraisal, CompetencyRating $rating, SubCompetencyRating $subRating): string
    {
        return sprintf(
            '/api/v1/appraisals/%s/competencies/%s/sub-competencies/%s/',
            $appraisal->getId(),
            $rating->getId(),
            $subRating->getId(),
        );
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

        $employee = EmployeeFactory::new()->withManager($managerEmployee)->create();
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
