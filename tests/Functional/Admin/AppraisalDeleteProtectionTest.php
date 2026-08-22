<?php

declare(strict_types=1);

namespace App\Tests\Functional\Admin;

use App\Entity\AppraisalCycle;
use App\Enum\AppraisalStatus;
use App\Factory\AppraisalCycleFactory;
use App\Factory\AppraisalFactory;
use App\Factory\UserFactory;
use App\Repository\AppraisalCycleRepository;
use App\Repository\AppraisalRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * Finalised appraisals and closed/archived cycles are HR's permanent
 * appraisal record (see EmployeeAppraisalHistoryController). Deleting
 * them via the /admin panel must be blocked server-side, not just hidden
 * from the UI — see AppraisalCrudController::deleteEntity() /
 * AppraisalCycleCrudController::deleteEntity().
 */
final class AppraisalDeleteProtectionTest extends WebTestCase
{
    public function testDeletingFinalisedAppraisalIsBlocked(): void
    {
        $client = static::createClient();
        $admin = UserFactory::new()->admin()->create();
        $appraisal = AppraisalFactory::new()->withStatus(AppraisalStatus::FINALISED)->create();
        $appraisalId = (string) $appraisal->getId();
        $client->loginUser($admin, 'admin');

        $detailPath = '/admin/appraisal/'.$appraisalId;
        $token = $this->csrfTokenFromPage($client, $detailPath);
        $client->request('POST', $detailPath.'/delete', ['token' => $token]);

        self::assertResponseStatusCodeSame(409);

        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->clear();
        self::assertNotNull(static::getContainer()->get(AppraisalRepository::class)->find($appraisalId));
    }

    public function testDeletingNonFinalisedAppraisalStillWorks(): void
    {
        $client = static::createClient();
        $admin = UserFactory::new()->admin()->create();
        $appraisal = AppraisalFactory::new()->withStatus(AppraisalStatus::SELF_ASSESSMENT)->create();
        $appraisalId = (string) $appraisal->getId();
        $client->loginUser($admin, 'admin');

        $detailPath = '/admin/appraisal/'.$appraisalId;
        $token = $this->csrfTokenFromPage($client, $detailPath);
        $client->request('POST', $detailPath.'/delete', ['token' => $token]);

        self::assertResponseRedirects();

        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->clear();
        self::assertNull(static::getContainer()->get(AppraisalRepository::class)->find($appraisalId));
    }

    /**
     * @return iterable<string, array{0: callable(): AppraisalCycle}>
     */
    public static function undeletableCycleProvider(): iterable
    {
        yield 'closed' => [static fn () => AppraisalCycleFactory::new()->closed()->create()];
        yield 'archived' => [static fn () => AppraisalCycleFactory::new()->archived()->create()];
    }

    /**
     * @dataProvider undeletableCycleProvider
     */
    public function testDeletingClosedOrArchivedCycleIsBlocked(callable $makeCycle): void
    {
        $client = static::createClient();
        $admin = UserFactory::new()->admin()->create();
        $cycle = $makeCycle();
        $cycleId = (string) $cycle->getId();
        $client->loginUser($admin, 'admin');

        $detailPath = '/admin/appraisal-cycle/'.$cycleId;
        $token = $this->csrfTokenFromPage($client, $detailPath);
        $client->request('POST', $detailPath.'/delete', ['token' => $token]);

        self::assertResponseStatusCodeSame(409);

        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->clear();
        self::assertNotNull(static::getContainer()->get(AppraisalCycleRepository::class)->find($cycleId));
    }

    public function testDeletingDraftCycleStillWorks(): void
    {
        $client = static::createClient();
        $admin = UserFactory::new()->admin()->create();
        $cycle = AppraisalCycleFactory::new()->create();
        $cycleId = (string) $cycle->getId();
        $client->loginUser($admin, 'admin');

        $detailPath = '/admin/appraisal-cycle/'.$cycleId;
        $token = $this->csrfTokenFromPage($client, $detailPath);
        $client->request('POST', $detailPath.'/delete', ['token' => $token]);

        self::assertResponseRedirects();

        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->clear();
        self::assertNull(static::getContainer()->get(AppraisalCycleRepository::class)->find($cycleId));
    }

    /**
     * The delete action's CSRF token is session-bound (SessionTokenStorage),
     * so it can't be minted out-of-band before any request has booted a
     * session — it has to be read off a real rendered admin page, exactly
     * like the browser's own delete button does via the shared
     * #action-confirmation-form partial included on every CRUD page.
     */
    private function csrfTokenFromPage(KernelBrowser $client, string $path): string
    {
        $crawler = $client->request('GET', $path);
        self::assertResponseIsSuccessful();

        return (string) $crawler->filter('#action-confirmation-form input[name="token"]')->attr('value');
    }
}
