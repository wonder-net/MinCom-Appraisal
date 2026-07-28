<?php

declare(strict_types=1);

namespace App\Command;

use App\Entity\AppraisalCycle;
use App\Entity\Employee;
use App\Entity\User;
use App\Enum\EmployeeClassification;
use App\Enum\RoleName;
use App\Factory\DepartmentFactory;
use App\Factory\RoleFactory;
use App\Repository\AppraisalCycleRepository;
use App\Repository\DepartmentRepository;
use App\Repository\EmployeeRepository;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * Port of apps.accounts.management.commands.seed_dev_data. Seeds roles,
 * departments, users with employee profiles, and a sample appraisal
 * cycle for local development. Idempotent — every record is looked up
 * before creating, so running this repeatedly never duplicates data,
 * matching Django's `get_or_create` guarantee exactly.
 *
 * Employee numbers are EMP-101..EMP-106, not Django's literal
 * EMP-001..EMP-006: this project's dev database already had ad-hoc
 * manually-created employees using EMP001/EMP002 (and a real
 * in-progress appraisal riding on one of them), and deleting those to
 * free up the literal Django numbers would have cascade-deleted that
 * appraisal (Appraisal.employee_id is ON DELETE CASCADE) — a real,
 * user-owned data loss for the sake of matching a seed script's
 * cosmetic numbering. Shifted the range instead; a fresh/empty
 * database would work identically either way.
 *
 * Reference-data seeding that Django splits into a second command
 * (`competencies.seed_data` — BSC perspectives, core competencies,
 * score descriptors) has no equivalent command here because this port
 * already bakes that data into Doctrine migrations
 * (Version20260710075155/Version20260710082730) rather than a
 * re-runnable command — those tables are populated on every fresh
 * database by definition, so there's nothing left for this command to do
 * for them.
 *
 * Uses `RoleFactory`/`DepartmentFactory`'s `findOrCreate()` where a clean
 * fit exists; User/Employee/AppraisalCycle are constructed directly
 * (matching MigrateFromDjangoCommand's style) since this data is fully
 * deterministic and gains nothing from Foundry's randomised-default
 * machinery.
 */
#[AsCommand(name: 'app:seed-dev-data', description: 'Seed roles, departments, users with employee profiles, and a sample appraisal cycle for local development')]
final class SeedDevDataCommand extends Command
{
    private const DEFAULT_PASSWORD = 'TestPass123!';

    /** @var list<array{name: string, code: string}> */
    private const DEPARTMENTS = [
        ['name' => 'Operations', 'code' => 'OPS'],
        ['name' => 'Finance', 'code' => 'FIN'],
        ['name' => 'Human Resources', 'code' => 'HR'],
        ['name' => 'Information Technology', 'code' => 'IT'],
    ];

    /** @var list<array<string, mixed>> */
    private const USER_SPECS = [
        [
            'email' => 'hr@mincom.test',
            'roles' => [RoleName::HR_ADMIN],
            'name' => 'Sarah Admin',
            'departmentCode' => 'HR',
            'employeeNumber' => 'EMP-101',
            'jobTitle' => 'HR Administrator',
            'jobFamily' => 'Human Capital',
            'classification' => EmployeeClassification::NON_MANAGERIAL,
            'location' => 'Head Office',
            'managerEmail' => null,
        ],
        [
            'email' => 'manager@mincom.test',
            'roles' => [RoleName::MANAGER],
            'name' => 'James Manager',
            'departmentCode' => 'OPS',
            'employeeNumber' => 'EMP-102',
            'jobTitle' => 'Branch Manager',
            'jobFamily' => 'Mining Operations',
            'classification' => EmployeeClassification::MANAGERIAL,
            'location' => 'Head Office',
            'managerEmail' => null,
        ],
        [
            'email' => 'employee1@mincom.test',
            'roles' => [RoleName::EMPLOYEE],
            'name' => 'Kwame Asante',
            'departmentCode' => 'OPS',
            'employeeNumber' => 'EMP-103',
            'jobTitle' => 'Operations Officer',
            'jobFamily' => 'Mining Operations',
            'classification' => EmployeeClassification::NON_MANAGERIAL,
            'location' => 'Tarkwa Mine Site',
            'managerEmail' => 'manager@mincom.test',
        ],
        [
            'email' => 'employee2@mincom.test',
            'roles' => [RoleName::EMPLOYEE],
            'name' => 'Ama Mensah',
            'departmentCode' => 'OPS',
            'employeeNumber' => 'EMP-104',
            'jobTitle' => 'Customer Service Rep',
            'jobFamily' => 'Mining Operations',
            'classification' => EmployeeClassification::NON_MANAGERIAL,
            'location' => 'Head Office',
            'managerEmail' => 'manager@mincom.test',
        ],
        [
            'email' => 'employee3@mincom.test',
            'roles' => [RoleName::EMPLOYEE],
            'name' => 'Kofi Boateng',
            'departmentCode' => 'FIN',
            'employeeNumber' => 'EMP-105',
            'jobTitle' => 'Finance Analyst',
            'jobFamily' => 'Corporate Finance',
            'classification' => EmployeeClassification::MANAGERIAL,
            'location' => 'Damang Mine Site',
            'managerEmail' => 'manager@mincom.test',
        ],
        [
            'email' => 'executive@mincom.test',
            'roles' => [RoleName::EXECUTIVE],
            'name' => 'Diana Executive',
            'departmentCode' => 'HR',
            'employeeNumber' => 'EMP-106',
            'jobTitle' => 'Chief Executive',
            'jobFamily' => 'Executive Leadership',
            'classification' => EmployeeClassification::MANAGERIAL,
            'location' => 'Head Office',
            'managerEmail' => null,
        ],
    ];

    private const CYCLE_PERIOD_NAME = '2026 Annual Review';
    private const CYCLE_CREATED_BY_EMAIL = 'hr@mincom.test';

    public function __construct(
        private readonly UserRepository $users,
        private readonly EmployeeRepository $employees,
        private readonly DepartmentRepository $departments,
        private readonly AppraisalCycleRepository $cycles,
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly EntityManagerInterface $em,
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $io->title('Seeding development data...');

        $this->em->wrapInTransaction(function () use ($io): void {
            $this->seedRoles($io);
            $departmentsByCode = $this->seedDepartments($io);
            $this->seedUsers($io, $departmentsByCode);
            $this->seedCycle($io);
        });

        $io->newLine();
        $io->section('Test Credentials:');
        $rows = array_map(
            static fn (array $spec): array => [$spec['email'], self::DEFAULT_PASSWORD, implode(', ', array_map(static fn (RoleName $r) => $r->value, $spec['roles']))],
            self::USER_SPECS,
        );
        $io->table(['Email', 'Password', 'Roles'], $rows);

        $io->success('Development data seeded successfully.');

        return Command::SUCCESS;
    }

    private function seedRoles(SymfonyStyle $io): void
    {
        $io->section('Roles:');
        foreach (RoleName::cases() as $roleName) {
            RoleFactory::findOrCreate(['name' => $roleName]);
        }
        $io->text('Ensured all '.count(RoleName::cases()).' roles exist.');
    }

    /**
     * @return array<string, \App\Entity\Department>
     */
    private function seedDepartments(SymfonyStyle $io): array
    {
        $io->section('Departments:');
        $byCode = [];
        foreach (self::DEPARTMENTS as $spec) {
            $department = DepartmentFactory::findOrCreate(['name' => $spec['name'], 'code' => $spec['code']]);
            $byCode[$spec['code']] = $department;
            $io->text(sprintf('  %s (%s)', $spec['name'], $spec['code']));
        }

        return $byCode;
    }

    /**
     * @param array<string, \App\Entity\Department> $departmentsByCode
     */
    private function seedUsers(SymfonyStyle $io, array $departmentsByCode): void
    {
        $io->section('Users + Employees:');

        /** @var array<string, User> $usersByEmail */
        $usersByEmail = [];

        // Pass 1: create users + employee profiles (no manager link yet).
        foreach (self::USER_SPECS as $spec) {
            $user = $this->users->findOneByEmailCaseInsensitive($spec['email']);
            if ($user === null) {
                $user = new User(strtolower($spec['email']));
                $user->setPassword($this->passwordHasher->hashPassword($user, self::DEFAULT_PASSWORD));
                $this->em->persist($user);
                $io->text('  + Created user: '.$spec['email']);
            } else {
                $io->text('  = Already exists: '.$spec['email']);
            }

            foreach ($spec['roles'] as $roleName) {
                $user->addRole(RoleFactory::findOrCreate(['name' => $roleName]));
            }
            $usersByEmail[$spec['email']] = $user;

            $employee = $this->employees->findByUser($user);
            if ($employee === null) {
                $employee = new Employee(
                    $user,
                    $spec['employeeNumber'],
                    $spec['name'],
                    $spec['jobTitle'],
                    $departmentsByCode[$spec['departmentCode']],
                    $spec['classification'],
                );
                $employee->setJobFamily($spec['jobFamily']);
                $employee->setLocation($spec['location']);
                $this->em->persist($employee);
            }
        }
        $this->em->flush();

        // Pass 2: manager linking, now that every Employee row exists.
        foreach (self::USER_SPECS as $spec) {
            if ($spec['managerEmail'] === null) {
                continue;
            }

            $employee = $this->employees->findByUser($usersByEmail[$spec['email']]);
            $manager = $this->employees->findByUser($usersByEmail[$spec['managerEmail']]);
            if ($employee !== null && $manager !== null && (string) $employee->getManager()?->getId() !== (string) $manager->getId()) {
                $employee->setManager($manager);
                $io->text(sprintf('  -> Set manager for %s: %s', $spec['email'], $spec['managerEmail']));
            }
        }
        $this->em->flush();
    }

    private function seedCycle(SymfonyStyle $io): void
    {
        $io->section('Appraisal Cycle:');

        $existing = $this->cycles->findOneBy(['periodName' => self::CYCLE_PERIOD_NAME]);
        if ($existing !== null) {
            $io->text('  = Already exists: '.self::CYCLE_PERIOD_NAME);

            return;
        }

        $hrUser = $this->users->findOneByEmailCaseInsensitive(self::CYCLE_CREATED_BY_EMAIL);
        \assert($hrUser instanceof User);

        $cycle = new AppraisalCycle(
            self::CYCLE_PERIOD_NAME,
            new \DateTimeImmutable('2026-01-01'),
            new \DateTimeImmutable('2026-12-31'),
            $hrUser,
            true,
        );
        $this->em->persist($cycle);
        $this->em->flush();
        $io->text('  + Created cycle: '.self::CYCLE_PERIOD_NAME);
    }
}
