<?php

declare(strict_types=1);

namespace App\Tests\Functional\Command;

use App\Entity\AuditLog;
use App\Factory\UserFactory;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Console\Application;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Console\Tester\CommandTester;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * Port of apps.accounts.management.commands.bootstrap_superuser's own
 * coverage: create, promote-without-touching-password, idempotent
 * skip, and — the whole point of the command — that the resulting
 * user has no Employee profile and no business role at all.
 */
final class BootstrapSuperuserCommandTest extends KernelTestCase
{
    public function testCreatesNakedSuperuserWithNoEmployeeOrBusinessRole(): void
    {
        $tester = $this->commandTester();

        $exitCode = $tester->execute([
            '--email' => 'super1@mincom.test',
            '--password' => 'Superuser-Pass123!',
        ]);

        self::assertSame(0, $exitCode);
        self::assertStringContainsString('Created superuser', $tester->getDisplay());

        $em = self::getContainer()->get(EntityManagerInterface::class);
        $user = self::getContainer()->get(UserRepository::class)->findOneByEmail('super1@mincom.test');
        self::assertNotNull($user);
        self::assertTrue($user->isSuperuser());
        self::assertTrue($user->isStaff());
        self::assertTrue($user->isActive());
        self::assertSame([], $user->getRoleNames(), 'no business role should be assigned');
        self::assertContains('ROLE_SUPERUSER', $user->getRoles());
        self::assertNotContains('ROLE_HR_ADMIN', $user->getRoles());
        self::assertNotContains('ROLE_SYSTEM_ADMIN', $user->getRoles());

        $hasEmployee = $em->getRepository(\App\Entity\Employee::class)->findOneBy(['user' => $user]);
        self::assertNull($hasEmployee, 'the bootstrapped superuser must have no Employee profile');
    }

    public function testPromotesExistingUserWithoutTouchingPassword(): void
    {
        $hasher = self::getContainer()->get(UserPasswordHasherInterface::class);
        $existing = UserFactory::new()->create();
        $originalHash = $existing->getPassword();
        self::getContainer()->get(EntityManagerInterface::class)->flush();

        $tester = $this->commandTester();
        $exitCode = $tester->execute(['--email' => $existing->getEmail()]);

        self::assertSame(0, $exitCode);
        self::assertStringContainsString('Promoted superuser', $tester->getDisplay());

        $em = self::getContainer()->get(EntityManagerInterface::class);
        $em->refresh($existing);
        self::assertTrue($existing->isSuperuser());
        self::assertTrue($existing->isStaff());
        self::assertSame($originalHash, $existing->getPassword());
        self::assertTrue($hasher->isPasswordValid($existing, UserFactory::DEFAULT_PASSWORD));
    }

    public function testIsIdempotentWhenAlreadyFullyConfigured(): void
    {
        $tester = $this->commandTester();
        $tester->execute(['--email' => 'super2@mincom.test', '--password' => 'Superuser-Pass123!']);

        $countBefore = $this->countAuditEntries();

        $secondRun = $this->commandTester();
        $exitCode = $secondRun->execute(['--email' => 'super2@mincom.test']);

        self::assertSame(0, $exitCode);
        self::assertStringContainsString('already configured', $secondRun->getDisplay());
        self::assertSame($countBefore, $this->countAuditEntries(), 'a no-op run must not write a new audit entry');
    }

    public function testRequiresPasswordWhenCreatingNewUser(): void
    {
        $tester = $this->commandTester();

        $exitCode = $tester->execute(['--email' => 'super3@mincom.test']);

        self::assertSame(1, $exitCode);
        self::assertStringContainsString('--password is required', $tester->getDisplay());
    }

    protected function setUp(): void
    {
        self::bootKernel();
    }

    private function commandTester(): CommandTester
    {
        $application = new Application(self::$kernel);

        // find() returns a Console\Command\LazyCommand wrapper, not
        // BootstrapSuperuserCommand directly — CommandTester works
        // with either, it just needs *a* Command instance.
        return new CommandTester($application->find('app:bootstrap-superuser'));
    }

    private function countAuditEntries(): int
    {
        return (int) self::getContainer()->get(EntityManagerInterface::class)
            ->createQueryBuilder()
            ->select('COUNT(a.id)')
            ->from(AuditLog::class, 'a')
            ->where("a.action = 'user.granted_superuser'")
            ->getQuery()
            ->getSingleScalarResult();
    }
}
