<?php

declare(strict_types=1);

namespace App\BulkImport;

use App\Entity\Department;
use App\Entity\Employee;
use App\Entity\Role;
use App\Entity\User;
use App\Enum\EmployeeClassification;
use App\Enum\RoleName;
use App\Repository\EmployeeRepository;
use App\Repository\RoleRepository;
use App\Service\DepartmentService;
use App\Service\EmailService;
use App\Service\EmployeeNumberNormalizer;
use App\Service\TempPasswordGenerator;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * Port of apps.accounts.bulk_import_service.BulkImportCreator: creates
 * User + Employee records row-by-row.
 *
 * Implements the same two-pass strategy as Django so appraisor references
 * resolve regardless of row order in the file (TASK-290):
 *
 * Pass 1 — create the User + Employee for every valid row with
 * manager=null. Each row commits independently (its own flush) so one
 * row's failure doesn't roll back rows already created — mirrors Django's
 * per-row transaction.atomic(). A caught failure detaches the row's own
 * entities from the UnitOfWork so the next row's flush isn't poisoned by
 * a half-persisted User/Employee pair.
 *
 * Pass 2 — for every successfully-created Employee whose row carries an
 * appraisor_employee_number, resolve the manager (first in the in-memory
 * created-this-run cache, then in the database) and persist the FK.
 */
final class BulkImportCreator
{
    private const MANAGERIAL_ROLES = [
        RoleName::MANAGER,
        RoleName::HR_ADMIN,
        RoleName::HR_OFFICER,
        RoleName::EXECUTIVE,
        RoleName::SYSTEM_ADMIN,
    ];

    public function __construct(
        private readonly BulkImportValidator $validator,
        private readonly RoleRepository $roles,
        private readonly EmployeeRepository $employees,
        private readonly DepartmentService $departments,
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly TempPasswordGenerator $tempPasswordGenerator,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
        private readonly EmailService $emailService,
        private readonly string $frontendUrl,
    ) {
    }

    /**
     * @param list<ParsedEmployeeRow> $rows
     * @param callable(int): void|null $progressCallback
     */
    public function execute(array $rows, int $maxRows = BulkImportValidator::MAX_ROWS, ?callable $progressCallback = null): CreationResult
    {
        // Re-validate to catch any changes since the preview was shown.
        $preview = $this->validator->validate($rows, $maxRows);
        $validRowNumbers = array_flip(array_map(static fn (RowPreview $r) => $r->rowNumber, $preview->validRows));
        $errorByRow = [];
        foreach ($preview->errorRows as $errorRow) {
            $errorByRow[$errorRow->rowNumber] = $errorRow->error;
        }

        $createdCount = 0;
        $failedRows = [];
        $processed = 0;

        /** @var array<string, Employee> $createdEmployees */
        $createdEmployees = [];
        /** @var list<array{0: ParsedEmployeeRow, 1: Employee}> $pendingManagerAssignments */
        $pendingManagerAssignments = [];
        /** @var array<string, Department> $departmentCache */
        $departmentCache = [];

        foreach ($rows as $row) {
            if (!isset($validRowNumbers[$row->rowNumber])) {
                $failedRows[] = [
                    'row_number' => $row->rowNumber,
                    'employee_number' => $row->employeeNumber,
                    'email' => $row->email,
                    'error' => $errorByRow[$row->rowNumber] ?? 'Validation failed.',
                ];
                $this->reportProgress($progressCallback, ++$processed);
                continue;
            }

            $user = null;
            $employee = null;

            try {
                $deptKey = strtolower($row->department);
                if (!isset($departmentCache[$deptKey])) {
                    $departmentCache[$deptKey] = $this->departments->getOrCreateByName($row->department);
                }
                $department = $departmentCache[$deptKey];

                $tempPassword = $this->tempPasswordGenerator->generate();
                $user = new User(strtolower($row->email));
                $user->setPassword($this->passwordHasher->hashPassword($user, $tempPassword));
                $user->setFullName($row->fullName);

                $roleNames = $this->parseRoles($row->rolesRaw);
                foreach ($roleNames as $roleName) {
                    $user->addRole($this->resolveRole($roleName));
                }

                $employee = new Employee(
                    $user,
                    $row->employeeNumber,
                    $row->fullName,
                    $row->jobTitle,
                    $department,
                    $this->deriveClassification($roleNames),
                );
                $employee->setJobFamily($row->jobFamily);
                $employee->setLocation($row->location);

                $this->em->persist($user);
                $this->em->persist($employee);
                $this->em->flush();

                $createdEmployees[EmployeeNumberNormalizer::normalize($row->employeeNumber)] = $employee;
                if ($row->appraisorEmployeeNumber !== '') {
                    $pendingManagerAssignments[] = [$row, $employee];
                }

                $loginUrl = rtrim($this->frontendUrl, '/').'/login';
                $this->emailService->sendWelcomeAccount($user->getEmail(), $row->fullName, $tempPassword, $loginUrl);
                $this->logger->info('Bulk import: created user for row {row} ({email})', [
                    'row' => $row->rowNumber,
                    'email' => $row->email,
                ]);

                ++$createdCount;
            } catch (\Throwable $exc) {
                $this->logger->error('Bulk import: failed to create user for row {row} ({email}): {message}', [
                    'row' => $row->rowNumber,
                    'email' => $row->email,
                    'message' => $exc->getMessage(),
                ]);

                if ($employee !== null && $this->em->contains($employee)) {
                    $this->em->detach($employee);
                }
                if ($user !== null && $this->em->contains($user)) {
                    $this->em->detach($user);
                }

                $failedRows[] = [
                    'row_number' => $row->rowNumber,
                    'employee_number' => $row->employeeNumber,
                    'email' => $row->email,
                    'error' => 'Account creation failed for this row. Contact support if the issue persists.',
                ];
            }

            $this->reportProgress($progressCallback, ++$processed);
        }

        foreach ($pendingManagerAssignments as [$row, $employee]) {
            $normalizedMgr = EmployeeNumberNormalizer::normalize($row->appraisorEmployeeNumber);
            $manager = $createdEmployees[$normalizedMgr] ?? $this->employees->findByEmployeeNumber($normalizedMgr);

            if ($manager === null) {
                // Validation guarantees the manager exists, so this is a
                // defensive log only.
                $this->logger->warning('Bulk import: appraisor {mgr} not found after creation for row {row}', [
                    'mgr' => $normalizedMgr,
                    'row' => $row->rowNumber,
                ]);
                continue;
            }

            try {
                $employee->setManager($manager);
                $this->em->flush();
            } catch (\Throwable $exc) {
                $this->logger->error('Bulk import: failed to assign manager for row {row}: {message}', [
                    'row' => $row->rowNumber,
                    'message' => $exc->getMessage(),
                ]);
            }
        }

        return new CreationResult(
            createdCount: $createdCount,
            failedCount: count($failedRows),
            totalRows: count($rows),
            failedRows: $failedRows,
        );
    }

    /**
     * @param list<RoleName> $roleNames
     */
    private function deriveClassification(array $roleNames): EmployeeClassification
    {
        foreach ($roleNames as $roleName) {
            if (in_array($roleName, self::MANAGERIAL_ROLES, true)) {
                return EmployeeClassification::MANAGERIAL;
            }
        }

        return EmployeeClassification::NON_MANAGERIAL;
    }

    /**
     * @param callable(int): void|null $progressCallback
     */
    private function reportProgress(?callable $progressCallback, int $processedCount): void
    {
        if ($progressCallback === null) {
            return;
        }

        try {
            $progressCallback($processedCount);
        } catch (\Throwable) {
            // Best-effort only — never let a progress callback failure abort the import.
        }
    }

    /**
     * @return list<RoleName>
     */
    private function parseRoles(string $rolesRaw): array
    {
        if ($rolesRaw === '') {
            return [RoleName::EMPLOYEE];
        }

        $roles = [];
        foreach (explode(',', $rolesRaw) as $raw) {
            if (trim($raw) === '') {
                continue;
            }
            $normalized = strtoupper(str_replace(' ', '_', trim($raw)));
            $normalized = match ($normalized) {
                'APPRAISEE' => 'EMPLOYEE',
                'APPRAISOR' => 'MANAGER',
                'HR_DIRECTOR' => 'HR_OFFICER',
                default => $normalized,
            };
            $roleName = RoleName::tryFrom($normalized);
            if ($roleName !== null) {
                $roles[] = $roleName;
            }
        }

        return $roles === [] ? [RoleName::EMPLOYEE] : $roles;
    }

    private function resolveRole(RoleName $name): Role
    {
        $role = $this->roles->findByName($name);
        if ($role !== null) {
            return $role;
        }

        $role = new Role($name);
        $this->em->persist($role);

        return $role;
    }
}
