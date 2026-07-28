<?php

declare(strict_types=1);

namespace App\Command;

use App\Entity\Department;
use App\Entity\Employee;
use App\Entity\Role;
use App\Entity\User;
use App\Enum\EmployeeClassification;
use App\Enum\RoleName;
use App\Repository\DepartmentRepository;
use App\Repository\RoleRepository;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * Minimal port of apps.accounts.management.commands.bootstrap_admin:
 * idempotently creates (or updates) the initial SYSTEM_ADMIN user plus
 * a Department/Employee profile, so the application has a way in
 * before any other admin exists. Unlike Django's version this doesn't
 * hash PII into an audit new_state — kept intentionally small since
 * its only job is first-run bootstrapping, not general user creation
 * (see AdminUserCreateController for that).
 */
#[AsCommand(name: 'app:bootstrap-admin', description: 'Create or update the initial SYSTEM_ADMIN user')]
final class BootstrapAdminCommand extends Command
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly RoleRepository $roles,
        private readonly DepartmentRepository $departments,
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly EntityManagerInterface $em,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('email', null, InputOption::VALUE_REQUIRED, 'Admin email', 'admin@mincom.local')
            ->addOption('password', null, InputOption::VALUE_REQUIRED, 'Admin password', 'Admin-Pass123!')
            ->addOption('name', null, InputOption::VALUE_REQUIRED, 'Full name', 'System Administrator');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        $email = $input->getOption('email');
        $password = $input->getOption('password');
        $name = $input->getOption('name');

        $user = $this->users->findOneByEmail($email);
        $created = $user === null;

        if ($created) {
            $user = new User($email);
        }

        $user->setPassword($this->passwordHasher->hashPassword($user, $password));
        $user->setLastPasswordChange(new \DateTimeImmutable());

        $systemAdminRole = $this->roles->findOneBy(['name' => RoleName::SYSTEM_ADMIN]);
        if ($systemAdminRole === null) {
            $systemAdminRole = new Role(RoleName::SYSTEM_ADMIN);
            $this->em->persist($systemAdminRole);
        }
        if (!$user->hasRole(RoleName::SYSTEM_ADMIN)) {
            $user->addRole($systemAdminRole);
        }

        if ($created) {
            $this->em->persist($user);
        }
        $this->em->flush();

        if ($this->users->findOneByEmail($email) !== null && $this->hasEmployeeProfile($user)) {
            $io->success(sprintf('%s SYSTEM_ADMIN user %s.', $created ? 'Created' : 'Updated', $email));

            return Command::SUCCESS;
        }

        $department = $this->departments->findOneByNameCaseInsensitive('Administration');
        if ($department === null) {
            $department = new Department('Administration', 'ADMIN');
            $this->em->persist($department);
        }

        $employee = new Employee($user, 'ADMIN-001', $name, 'System Administrator', $department, EmployeeClassification::MANAGERIAL);
        $this->em->persist($employee);
        $this->em->flush();

        $io->success(sprintf('%s SYSTEM_ADMIN user %s (password: %s).', $created ? 'Created' : 'Updated', $email, $password));

        return Command::SUCCESS;
    }

    private function hasEmployeeProfile(User $user): bool
    {
        return $this->em->getRepository(Employee::class)->findOneBy(['user' => $user]) !== null;
    }
}
