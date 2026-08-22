<?php

declare(strict_types=1);

namespace App\Tests\Functional\Appraisals;

use App\Entity\Appraisal;
use App\Entity\AppraisalCycle;
use App\Entity\Competency;
use App\Entity\CompetencyRating;
use App\Entity\User;
use App\Enum\RoleName;
use App\Factory\AppraisalCycleFactory;
use App\Factory\CompetencyFactory;
use App\Factory\EmployeeFactory;
use App\Factory\SubCompetencyFactory;
use App\Factory\UserFactory;
use App\Repository\AppraisalCycleRepository;
use App\Repository\AppraisalRepository;
use App\Repository\CompetencyRatingRepository;
use App\Repository\CompetencyRepository;
use App\Repository\SubCompetencyRatingRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Cycle activation (AppraisalInstanceBuilder) seeds SubCompetencyRating
 * rows, with frozen equal-split maxScore shares, for every core value
 * that has active sub-competencies configured — and none at all for a
 * competency with no sub-competencies (the legacy direct-rating path).
 */
final class SubCompetencyRatingSeedingTest extends WebTestCase
{
    private const LIST_URL = '/api/v1/appraisals/cycles/';

    public function testActivationSeedsSubCompetencyRatingsWithSharesSummingToMax(): void
    {
        $client = static::createClient();
        $competency = CompetencyFactory::new()->create();
        SubCompetencyFactory::new()->create(['competency' => $competency, 'name' => 'Collaboration', 'sortOrder' => 1]);
        SubCompetencyFactory::new()->create(['competency' => $competency, 'name' => 'Communication', 'sortOrder' => 2]);
        SubCompetencyFactory::new()->create(['competency' => $competency, 'name' => 'Reliability', 'sortOrder' => 3]);
        $cycle = AppraisalCycleFactory::new()->create();
        EmployeeFactory::new()->create();
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('POST', self::LIST_URL.$cycle->getId().'/activate/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();

        $rating = $this->findSeededRating($cycle, $competency);
        self::assertNotNull($rating);

        $subCompetencyRatings = static::getContainer()->get(SubCompetencyRatingRepository::class);
        $subRatings = $subCompetencyRatings->findByCompetencyRatingOrdered($rating);
        self::assertCount(3, $subRatings);

        $names = array_map(static fn ($sr) => $sr->getSubCompetency()->getName(), $subRatings);
        self::assertSame(['Collaboration', 'Communication', 'Reliability'], $names);

        $sum = '0';
        foreach ($subRatings as $subRating) {
            $sum = bcadd($sum, $subRating->getMaxScore(), 2);
            self::assertNull($subRating->getSelfRating());
            self::assertNull($subRating->getManagerRating());
        }
        self::assertSame('7.50', $sum);
    }

    public function testCompetencyWithoutSubCompetenciesGetsNoSubRatingRows(): void
    {
        $client = static::createClient();
        $competency = CompetencyFactory::new()->create();
        $cycle = AppraisalCycleFactory::new()->create();
        EmployeeFactory::new()->create();
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN, $client);

        $client->request('POST', self::LIST_URL.$cycle->getId().'/activate/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();

        $rating = $this->findSeededRating($cycle, $competency);
        self::assertNotNull($rating);

        $subCompetencyRatings = static::getContainer()->get(SubCompetencyRatingRepository::class);
        self::assertSame([], $subCompetencyRatings->findByCompetencyRatingOrdered($rating));
    }

    private function findSeededRating(AppraisalCycle $cycle, Competency $competency): ?CompetencyRating
    {
        static::getContainer()->get(EntityManagerInterface::class)->clear();

        $freshCycle = static::getContainer()->get(AppraisalCycleRepository::class)->find($cycle->getId());
        $freshCompetency = static::getContainer()->get(CompetencyRepository::class)->find($competency->getId());
        $competencyRatings = static::getContainer()->get(CompetencyRatingRepository::class);

        $appraisals = static::getContainer()->get(AppraisalRepository::class)->findByCycleOrderedByDepartmentAndEmployeeId($freshCycle);
        foreach ($appraisals as $appraisal) {
            \assert($appraisal instanceof Appraisal);
            $candidate = $competencyRatings->findOneByAppraisalAndCompetency($appraisal, $freshCompetency);
            if ($candidate !== null) {
                return $candidate;
            }
        }

        return null;
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
