<?php

declare(strict_types=1);

namespace App\Tests\Functional\Appraisals;

use App\Entity\Appraisal;
use App\Entity\CompetencyRating;
use App\Entity\Employee;
use App\Entity\User;
use App\Enum\AppraisalFormType;
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

final class CompetencyRatingTest extends WebTestCase
{
    public function testAppraiseeSetsSelfRatingDuringSelfAssessment(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::SELF_ASSESSMENT);
        $rating = $this->addRating($appraisal);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('PATCH', '/api/v1/appraisals/'.$appraisal->getId().'/competencies/'.$rating->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'self_rating' => '4.5',
        ]));

        self::assertResponseIsSuccessful();
        self::assertSame('4.50', json_decode($client->getResponse()->getContent(), true)['data']['self_rating']);
    }

    public function testAppraiseeCannotSetManagerRating(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::SELF_ASSESSMENT);
        $rating = $this->addRating($appraisal);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        // The appraisee is routed through the self-rating write path
        // (SELF_ASSESSMENT + self_rating_enabled), which only recognises
        // self_rating — sending manager_rating instead leaves the
        // required self_rating field missing, producing 400 (matching
        // Django: the write serializer is chosen by role/status, not by
        // which keys the client happens to send).
        $client->request('PATCH', '/api/v1/appraisals/'.$appraisal->getId().'/competencies/'.$rating->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'manager_rating' => '4.5',
        ]));

        self::assertResponseStatusCodeSame(400);
    }

    public function testAppraiseeCannotRateOutsideSelfAssessment(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::DISCUSSION);
        $rating = $this->addRating($appraisal);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('PATCH', '/api/v1/appraisals/'.$appraisal->getId().'/competencies/'.$rating->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'self_rating' => '4.5',
        ]));

        self::assertResponseStatusCodeSame(403);
    }

    public function testManagerSetsManagerRatingDuringManagerReview(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::MANAGER_REVIEW);
        $rating = $this->addRating($appraisal);
        [$client, $accessToken] = $this->loginAsManagerOf($client, $appraisal);

        $client->request('PATCH', '/api/v1/appraisals/'.$appraisal->getId().'/competencies/'.$rating->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'manager_rating' => '3.5',
        ]));

        self::assertResponseIsSuccessful();
        self::assertSame('3.50', json_decode($client->getResponse()->getContent(), true)['data']['manager_rating']);
    }

    public function testManagerRatingAllowedDuringDiscussion(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::DISCUSSION);
        $rating = $this->addRating($appraisal);
        [$client, $accessToken] = $this->loginAsManagerOf($client, $appraisal);

        $client->request('PATCH', '/api/v1/appraisals/'.$appraisal->getId().'/competencies/'.$rating->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'manager_rating' => '2.5',
        ]));

        self::assertResponseIsSuccessful();
    }

    public function testManagerRatingAllowedDuringDisputed(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::DISPUTED);
        $rating = $this->addRating($appraisal);
        [$client, $accessToken] = $this->loginAsManagerOf($client, $appraisal);

        $client->request('PATCH', '/api/v1/appraisals/'.$appraisal->getId().'/competencies/'.$rating->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'manager_rating' => '2.5',
        ]));

        self::assertResponseIsSuccessful();
    }

    public function testRatingOutOfRangeRejected(): void
    {
        $client = static::createClient();
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::SELF_ASSESSMENT);
        $rating = $this->addRating($appraisal);
        [$client, $accessToken] = $this->loginAsAppraisee($client, $appraisal);

        $client->request('PATCH', '/api/v1/appraisals/'.$appraisal->getId().'/competencies/'.$rating->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'self_rating' => '5.5',
        ]));

        self::assertResponseStatusCodeSame(400);
    }

    public function testFullScoringFlowComputesTotalsAndDescriptors(): void
    {
        $client = static::createClient();
        $perspective = BscPerspectiveFactory::new()->create(['weightCap' => '1.0000']);
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::MANAGER_REVIEW);
        $kd = KeyDeliverableFactory::new()->create(['appraisal' => $appraisal, 'perspective' => $perspective, 'weight' => '1.0000']);
        $rating = $this->addRating($appraisal);
        [$client, $accessToken] = $this->loginAsManagerOf($client, $appraisal);

        // Rate the KD first (weight 1.0 * rating 4.0 = kd_average 4.00).
        $client->request('PATCH', '/api/v1/appraisals/'.$appraisal->getId().'/deliverables/'.$kd->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'manager_rating' => '4.0',
        ]));
        self::assertResponseIsSuccessful();

        // Rate the only competency (bc_average = 4.00 too).
        $client->request('PATCH', '/api/v1/appraisals/'.$appraisal->getId().'/competencies/'.$rating->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'manager_rating' => '4.0',
        ]));
        self::assertResponseIsSuccessful();

        $client->request('GET', '/api/v1/appraisals/'.$appraisal->getId().'/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];

        self::assertSame('4.00', $body['kd_average_score']);
        self::assertSame('4.00', $body['bc_average_score']);
        // total = 4.00*0.7 + 4.00*0.3 = 4.00
        self::assertSame('4.00', $body['total_score']);
        self::assertSame('Exceeds Expectations', $body['kd_descriptor']);
        self::assertSame('Very Good', $body['bc_descriptor']);
        self::assertSame('Exceeds Expectations', $body['performance_descriptor']);
    }

    public function testScoreStaysNullUntilAllRatingsPresent(): void
    {
        $client = static::createClient();
        $perspective = BscPerspectiveFactory::new()->create(['weightCap' => '1.0000']);
        $appraisal = $this->makeAppraisal($client, AppraisalStatus::MANAGER_REVIEW);
        $kd = KeyDeliverableFactory::new()->create(['appraisal' => $appraisal, 'perspective' => $perspective, 'weight' => '1.0000']);
        $this->addRating($appraisal); // left unrated
        [$client, $accessToken] = $this->loginAsManagerOf($client, $appraisal);

        $client->request('PATCH', '/api/v1/appraisals/'.$appraisal->getId().'/deliverables/'.$kd->getId().'/', server: $this->authHeader($accessToken), content: json_encode([
            'manager_rating' => '4.0',
        ]));
        self::assertResponseIsSuccessful();

        $client->request('GET', '/api/v1/appraisals/'.$appraisal->getId().'/', server: $this->authHeader($accessToken));
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertNull($body['total_score']);
        self::assertNotNull($body['kd_average_score']);
    }

    private function addRating(Appraisal $appraisal): CompetencyRating
    {
        $competency = CompetencyFactory::new()->create();
        $rating = new CompetencyRating($appraisal, $competency);
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->persist($rating);
        $em->flush();

        return $rating;
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
