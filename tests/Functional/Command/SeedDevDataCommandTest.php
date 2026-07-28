<?php

declare(strict_types=1);

namespace App\Tests\Functional\Command;

use App\Entity\User;
use App\Enum\RoleName;
use App\Repository\AppraisalCycleRepository;
use App\Repository\EmployeeRepository;
use App\Repository\RoleRepository;
use App\Repository\UserRepository;
use Symfony\Bundle\FrameworkBundle\Console\Application;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Console\Tester\CommandTester;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * Port of apps.accounts.management.commands.seed_dev_data's own
 * implicit coverage: idempotency (running twice creates nothing extra)
 * is the whole point of the command, so that's the primary thing
 * tested here, alongside the manager-linking two-pass logic and the
 * advertised test password actually working.
 */
final class SeedDevDataCommandTest extends KernelTestCase
{
    public function testSeedsRolesDepartmentsUsersAndCycle(): void
    {
        $tester = $this->commandTester();
        $exitCode = $tester->execute([]);

        self::assertSame(0, $exitCode);
        self::assertStringContainsString('Development data seeded successfully', $tester->getDisplay());

        $roles = self::getContainer()->get(RoleRepository::class);
        foreach (RoleName::cases() as $roleName) {
            self::assertNotNull($roles->findByName($roleName));
        }

        $users = self::getContainer()->get(UserRepository::class);
        $employees = self::getContainer()->get(EmployeeRepository::class);

        $manager = $users->findOneByEmailCaseInsensitive('manager@mincom.test');
        self::assertNotNull($manager);
        self::assertTrue($manager->hasRole(RoleName::MANAGER));

        $employee1 = $users->findOneByEmailCaseInsensitive('employee1@mincom.test');
        self::assertNotNull($employee1);

        $employee1Profile = $employees->findByUser($employee1);
        $managerProfile = $employees->findByUser($manager);
        self::assertNotNull($employee1Profile);
        self::assertSame((string) $managerProfile->getId(), (string) $employee1Profile->getManager()?->getId());
        self::assertSame('EMP103', $employee1Profile->getEmployeeNumber());

        $cycles = self::getContainer()->get(AppraisalCycleRepository::class);
        self::assertNotNull($cycles->findOneBy(['periodName' => '2026 Annual Review']));

        // The advertised test password must actually work.
        $hasher = self::getContainer()->get(UserPasswordHasherInterface::class);
        self::assertTrue($hasher->isPasswordValid($manager, 'TestPass123!'));
    }

    public function testRunningTwiceIsIdempotent(): void
    {
        $this->commandTester()->execute([]);
        $this->commandTester()->execute([]);

        $users = self::getContainer()->get(UserRepository::class);
        $userCount = 0;
        foreach (['hr@mincom.test', 'manager@mincom.test', 'employee1@mincom.test', 'employee2@mincom.test', 'employee3@mincom.test', 'executive@mincom.test'] as $email) {
            if ($users->findOneByEmailCaseInsensitive($email) instanceof User) {
                ++$userCount;
            }
        }
        self::assertSame(6, $userCount);

        $cycles = self::getContainer()->get(AppraisalCycleRepository::class);
        $count = count($cycles->findBy(['periodName' => '2026 Annual Review']));
        self::assertSame(1, $count, 'a second run must not create a duplicate cycle');
    }

    private function commandTester(): CommandTester
    {
        $application = new Application(self::$kernel);

        return new CommandTester($application->find('app:seed-dev-data'));
    }

    protected function setUp(): void
    {
        self::bootKernel();
    }
}
