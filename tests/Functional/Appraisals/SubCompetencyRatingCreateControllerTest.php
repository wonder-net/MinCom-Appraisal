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
use App\Repository\CompetencyRatingRepository;
use App\Repository\SubCompetencyRatingRepository;
use App\Service\SubCompetencyWeightCalculator;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class SubCompetencyRatingCreateControllerTest extends WebTestCase
{
    public function testAppraiseeAddsSubCompetencyToAPreviouslyFlatCompetency(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::SELF_ASSESSMENT);
        $rating = $this->addFlatRating($appraisal);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', $this->url($appraisal, $rating), server: $this->authHeader($accessToken), content: json_encode([
            'name' => 'Punctuality',
        ]));

        self::assertResponseStatusCodeSame(201);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertCount(1, $body['sub_competency_ratings']);
        self::assertSame('Punctuality', $body['sub_competency_ratings'][0]['name']);
        self::assertTrue($body['sub_competency_ratings'][0]['is_custom']);
        self::assertNull($body['sub_competency_ratings'][0]['sub_competency']);
        self::assertSame('7.50', $body['sub_competency_ratings'][0]['max_score']);
    }

    public function testAddingASecondItemResharesWeightsAndClearsExistingSelfRating(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::SELF_ASSESSMENT);
        ['rating' => $rating, 'subRatings' => $subRatings] = $this->addRatingWithSubCompetencies($appraisal, 1);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        // Rate the one existing sub-item first.
        $client->request('PATCH', sprintf(
            '/api/v1/appraisals/%s/competencies/%s/sub-competencies/%s/',
            $appraisal->getId(),
            $rating->getId(),
            $subRatings[0]->getId(),
        ), server: $this->authHeader($accessToken), content: json_encode(['self_rating' => '7.5']));
        self::assertResponseIsSuccessful();

        $client->request('POST', $this->url($appraisal, $rating), server: $this->authHeader($accessToken), content: json_encode([
            'name' => 'Second Item',
        ]));
        self::assertResponseStatusCodeSame(201);

        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertCount(2, $body['sub_competency_ratings']);
        $sum = '0';
        foreach ($body['sub_competency_ratings'] as $sub) {
            $sum = bcadd($sum, $sub['max_score'], 2);
            // The reshare must have cleared the earlier self-rating —
            // it no longer reflects the new (smaller) share.
            self::assertNull($sub['self_rating']);
        }
        self::assertSame('7.50', $sum);
        self::assertNull($body['self_rating']);
    }

    public function testDuplicateNameRejected(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::SELF_ASSESSMENT);
        ['rating' => $rating] = $this->addRatingWithSubCompetencies($appraisal, 1, 'Collaboration');
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', $this->url($appraisal, $rating), server: $this->authHeader($accessToken), content: json_encode([
            'name' => 'collaboration',
        ]));

        self::assertResponseStatusCodeSame(400);
    }

    public function testEmptyNameRejected(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::SELF_ASSESSMENT);
        $rating = $this->addFlatRating($appraisal);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', $this->url($appraisal, $rating), server: $this->authHeader($accessToken), content: json_encode([
            'name' => '   ',
        ]));

        self::assertResponseStatusCodeSame(400);
    }

    public function testManagerCannotAddSubCompetency(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::SELF_ASSESSMENT);
        $rating = $this->addFlatRating($appraisal);
        [$client, $accessToken] = $this->loginAsManagerOf($client, $appraisal);

        $client->request('POST', $this->url($appraisal, $rating), server: $this->authHeader($accessToken), content: json_encode([
            'name' => 'Punctuality',
        ]));

        self::assertResponseStatusCodeSame(403);
    }

    public function testCannotAddOutsideSelfAssessment(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::MANAGER_REVIEW);
        $rating = $this->addFlatRating($appraisal);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('POST', $this->url($appraisal, $rating), server: $this->authHeader($accessToken), content: json_encode([
            'name' => 'Punctuality',
        ]));

        self::assertResponseStatusCodeSame(403);
    }

    private function addFlatRating(Appraisal $appraisal): CompetencyRating
    {
        $competency = CompetencyFactory::new()->create();
        $rating = new CompetencyRating($appraisal, $competency);
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->persist($rating);
        $em->flush();

        return $rating;
    }

    /**
     * @return array{rating: CompetencyRating, subRatings: list<SubCompetencyRating>}
     */
    private function addRatingWithSubCompetencies(Appraisal $appraisal, int $count, ?string $firstName = null): array
    {
        $competency = CompetencyFactory::new()->create();
        $weights = (new SubCompetencyWeightCalculator())->computeShares($count);

        $rating = new CompetencyRating($appraisal, $competency);
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->persist($rating);

        $subRatings = [];
        for ($i = 0; $i < $count; ++$i) {
            $subCompetency = SubCompetencyFactory::new()->create([
                'competency' => $competency,
                'sortOrder' => $i,
                ...($i === 0 && $firstName !== null ? ['name' => $firstName] : []),
            ]);
            $subRating = new SubCompetencyRating($rating, $subCompetency, $subCompetency->getName(), $i, $weights[$i]);
            $em->persist($subRating);
            $subRatings[] = $subRating;
        }

        $em->flush();

        return ['rating' => $rating, 'subRatings' => $subRatings];
    }

    private function url(Appraisal $appraisal, CompetencyRating $rating): string
    {
        return sprintf('/api/v1/appraisals/%s/competencies/%s/sub-competencies/', $appraisal->getId(), $rating->getId());
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
