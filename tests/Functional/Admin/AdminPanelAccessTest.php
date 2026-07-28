<?php

declare(strict_types=1);

namespace App\Tests\Functional\Admin;

use App\Entity\Competency;
use App\Entity\Notification;
use App\Enum\RoleName;
use App\Factory\CompetencyFactory;
use App\Factory\RoleFactory;
use App\Factory\UserFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/**
 * The Symfony-side equivalent of Django's django-admin registrations
 * (apps/accounts, competencies, appraisals, notifications, employees
 * admin.py) — the ops/support surface for inspecting and fixing stuck
 * records, gated to HR_ADMIN/SYSTEM_ADMIN behind a separate,
 * session-based firewall (see config/packages/security.yaml).
 */
final class AdminPanelAccessTest extends WebTestCase
{
    public function testAnonymousAccessRedirectsToLogin(): void
    {
        $client = static::createClient();
        $client->request('GET', '/admin/employee');

        self::assertResponseRedirects('/admin/login');
    }

    public function testNonAdminUserIsForbidden(): void
    {
        $client = static::createClient();
        $user = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        $client->loginUser($user, 'admin');

        $client->request('GET', '/admin/employee');

        self::assertResponseStatusCodeSame(403);
    }

    /**
     * Port of Django's bootstrap_superuser design: a "naked" account
     * (App\Command\BootstrapSuperuserCommand) with no Employee profile
     * and no HR_ADMIN/SYSTEM_ADMIN role at all — only User::isSuperuser()
     * — must still reach /admin. UserTest covers the flip side
     * (hasAdminRole() stays false, so business-RBAC-gated endpoints
     * remain closed to it).
     */
    public function testNakedSuperuserCanAccessAdminPanel(): void
    {
        $client = static::createClient();
        $user = UserFactory::new()->create();
        $user->setIsSuperuser(true);
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        $client->loginUser($user, 'admin');
        $client->request('GET', '/admin/employee');

        self::assertResponseIsSuccessful();
    }

    public function testAdminUserCanAccessDashboard(): void
    {
        $client = static::createClient();
        $user = UserFactory::new()->admin()->create();
        $client->loginUser($user, 'admin');

        $client->request('GET', '/admin');

        self::assertResponseRedirects('/admin/employee');
    }

    /**
     * @return iterable<string, array{0: string}>
     */
    public static function crudIndexRouteProvider(): iterable
    {
        yield 'employee' => ['/admin/employee'];
        yield 'user' => ['/admin/user'];
        yield 'competency' => ['/admin/competency'];
        yield 'department' => ['/admin/department'];
        yield 'bsc-perspective' => ['/admin/bsc-perspective'];
        yield 'role' => ['/admin/role'];
        yield 'notification' => ['/admin/notification'];
    }

    /**
     * @dataProvider crudIndexRouteProvider
     */
    public function testAdminCanListEachEntity(string $path): void
    {
        $client = static::createClient();
        $user = UserFactory::new()->admin()->create();
        $client->loginUser($user, 'admin');

        $client->request('GET', $path);

        self::assertResponseIsSuccessful();
    }

    /**
     * @return iterable<string, array{0: string}>
     */
    public static function disabledNewActionProvider(): iterable
    {
        yield 'employee' => ['/admin/employee/new'];
        yield 'user' => ['/admin/user/new'];
        yield 'competency' => ['/admin/competency/new'];
        yield 'department' => ['/admin/department/new'];
        yield 'bsc-perspective' => ['/admin/bsc-perspective/new'];
        yield 'role' => ['/admin/role/new'];
        yield 'notification' => ['/admin/notification/new'];
    }

    /**
     * @dataProvider disabledNewActionProvider
     *
     * Creation is deliberately disabled for all 7 entities in this first
     * version — see each CrudController's class docblock for why.
     */
    public function testNewActionIsDisabledForEveryEntity(string $path): void
    {
        $client = static::createClient();
        $user = UserFactory::new()->admin()->create();
        $client->loginUser($user, 'admin');

        $client->request('GET', $path);

        self::assertResponseStatusCodeSame(403);
    }

    public function testRoleEditIsDisabled(): void
    {
        $client = static::createClient();
        $user = UserFactory::new()->admin()->create();
        $role = RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]);
        $client->loginUser($user, 'admin');

        $client->request('GET', '/admin/role/'.$role->getId().'/edit');

        self::assertResponseStatusCodeSame(403);
    }

    public function testNotificationEditIsDisabled(): void
    {
        $client = static::createClient();
        $admin = UserFactory::new()->admin()->create();
        $recipient = UserFactory::new()->create();

        // No Notification factory exists; build one directly.
        $notification = new Notification($recipient, null, 'test.event', 'Test', 'Test message');
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->persist($notification);
        $em->flush();

        $client->loginUser($admin, 'admin');

        $client->request('GET', '/admin/notification/'.$notification->getId().'/edit');

        self::assertResponseStatusCodeSame(403);
    }

    public function testEditingCompetencyPersists(): void
    {
        $client = static::createClient();
        $admin = UserFactory::new()->admin()->create();
        $competency = CompetencyFactory::new()->create(['sortOrder' => 1]);
        $client->loginUser($admin, 'admin');

        $crawler = $client->request('GET', '/admin/competency/'.$competency->getId().'/edit');
        self::assertResponseIsSuccessful();

        $form = $crawler->filter('form.ea-edit-form')->form();
        $form['Competency[sortOrder]'] = '42';
        $client->submit($form);

        self::assertResponseRedirects();

        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->clear();
        $refreshed = $em->getRepository(Competency::class)->find($competency->getId());
        self::assertSame(42, $refreshed->getSortOrder());
    }
}
