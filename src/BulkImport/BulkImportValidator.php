<?php

declare(strict_types=1);

namespace App\BulkImport;

use App\Enum\RoleName;
use App\Repository\DepartmentRepository;
use App\Repository\EmployeeRepository;
use App\Repository\UserRepository;
use App\Service\EmployeeNumberNormalizer;

/**
 * Port of apps.accounts.bulk_import_service.BulkImportValidator.
 */
final class BulkImportValidator
{
    public const MAX_ROWS = 500;
    public const ASYNC_MAX_ROWS = 10000;

    private const VALID_ROLES = [
        'EMPLOYEE', 'MANAGER', 'HR_OFFICER', 'HR_ADMIN', 'EXECUTIVE', 'SYSTEM_ADMIN',
    ];

    /**
     * TASK-269/279: bulk-import label aliases the UI shows instead of the
     * internal enum values.
     *
     * @var array<string, string>
     */
    private const ROLE_ALIASES = [
        'APPRAISEE' => 'EMPLOYEE',
        'APPRAISOR' => 'MANAGER',
        'HR_DIRECTOR' => 'HR_OFFICER',
    ];

    private const EMAIL_PATTERN = '/^[^@\s]+@[^@\s]+\.[^@\s]+$/';

    public function __construct(
        private readonly UserRepository $users,
        private readonly EmployeeRepository $employees,
        private readonly DepartmentRepository $departments,
    ) {
    }

    /**
     * @param list<ParsedEmployeeRow> $rows
     */
    public function validate(array $rows, int $maxRows = self::MAX_ROWS): ValidationPreview
    {
        if (count($rows) > $maxRows) {
            return new ValidationPreview(
                errorRows: [new RowPreview(0, '', '', '', 'error', sprintf('File contains %d rows. Maximum is %d.', count($rows), $maxRows))],
                total: count($rows),
            );
        }

        $emailsInFile = array_values(array_filter(array_map(static fn (ParsedEmployeeRow $r) => strtolower($r->email), $rows)));
        $existingEmails = $emailsInFile === [] ? [] : $this->users->findExistingEmailsCaseInsensitive($emailsInFile);
        $existingEmailSet = array_flip(array_map(strtolower(...), $existingEmails));

        $allFileEmpNums = [];
        foreach ($rows as $row) {
            if ($row->employeeNumber !== '') {
                $allFileEmpNums[EmployeeNumberNormalizer::normalize($row->employeeNumber)] = true;
            }
        }

        $existingEmpNumSet = array_flip($this->employees->findExistingEmployeeNumbers(array_keys($allFileEmpNums)));

        // Case-insensitive department lookup across ALL existing departments
        // (not just those mentioned in this file) so we can detect existing
        // departments that the file references with different casing.
        $existingDeptsLower = [];
        foreach ($this->departments->findAllOrderedByName() as $department) {
            $existingDeptsLower[strtolower($department->getName())] = true;
        }

        $mgrNumsNormalized = [];
        foreach ($rows as $row) {
            if ($row->appraisorEmployeeNumber !== '') {
                $mgrNumsNormalized[] = EmployeeNumberNormalizer::normalize($row->appraisorEmployeeNumber);
            }
        }
        $existingManagerSet = array_flip($this->employees->findExistingActiveEmployeeNumbers($mgrNumsNormalized));

        $seenEmails = [];
        $seenEmpNums = [];
        $validRows = [];
        $errorRows = [];
        $newDepartments = [];

        foreach ($rows as $row) {
            $errors = [];

            if ($row->employeeNumber === '') {
                $errors[] = 'Employee number is required.';
            }
            if ($row->fullName === '') {
                $errors[] = 'Full name is required.';
            }
            if ($row->email === '') {
                $errors[] = 'Email is required.';
            } elseif (preg_match(self::EMAIL_PATTERN, $row->email) !== 1) {
                $errors[] = 'Invalid email format.';
            }
            if ($row->jobTitle === '') {
                $errors[] = 'Job title is required.';
            }
            if ($row->department === '') {
                $errors[] = 'Department is required.';
            }

            $rawRoles = $this->parseRoles($row->rolesRaw);
            $invalidRoles = array_values(array_diff($rawRoles, self::VALID_ROLES));
            if ($invalidRoles !== []) {
                $errors[] = sprintf(
                    'Invalid role(s): %s. Valid roles: APPRAISEE (or EMPLOYEE), APPRAISOR (or MANAGER), '.
                    'HR_DIRECTOR (or HR_OFFICER), HR_ADMIN, EXECUTIVE, SYSTEM_ADMIN.',
                    implode(', ', $invalidRoles),
                );
            }

            $emailLower = strtolower($row->email);
            if ($row->email !== '' && isset($existingEmailSet[$emailLower])) {
                $errors[] = 'Email already exists in the system.';
            }

            $normalizedEmpNum = $row->employeeNumber !== '' ? EmployeeNumberNormalizer::normalize($row->employeeNumber) : '';

            if ($normalizedEmpNum !== '' && isset($existingEmpNumSet[$normalizedEmpNum])) {
                $errors[] = 'Employee number already exists.';
            }

            if ($emailLower !== '' && isset($seenEmails[$emailLower])) {
                $errors[] = sprintf('Duplicate email in file (also on row %d).', $seenEmails[$emailLower]);
            } elseif ($emailLower !== '') {
                $seenEmails[$emailLower] = $row->rowNumber;
            }

            if ($normalizedEmpNum !== '' && isset($seenEmpNums[$normalizedEmpNum])) {
                $errors[] = sprintf('Duplicate employee number in file (also on row %d).', $seenEmpNums[$normalizedEmpNum]);
            } elseif ($normalizedEmpNum !== '') {
                $seenEmpNums[$normalizedEmpNum] = $row->rowNumber;
            }

            // Department resolution — no error, just tracked for the preview.
            if ($row->department !== '' && !isset($existingDeptsLower[strtolower($row->department)])) {
                $newDepartments[$row->department] = true;
            }

            if ($row->appraisorEmployeeNumber !== '') {
                $normalizedMgr = EmployeeNumberNormalizer::normalize($row->appraisorEmployeeNumber);
                if ($normalizedEmpNum !== '' && $normalizedMgr === $normalizedEmpNum) {
                    $errors[] = 'An employee cannot be their own appraisor.';
                } else {
                    $mgrExistsInDb = isset($existingManagerSet[$normalizedMgr]);
                    $mgrExistsInFile = isset($allFileEmpNums[$normalizedMgr]);
                    if (!$mgrExistsInDb && !$mgrExistsInFile) {
                        $errors[] = 'Appraisor employee number not found in the file or in the system.';
                    }
                }
            }

            $preview = new RowPreview($row->rowNumber, $row->employeeNumber, $row->fullName, $row->email, $errors === [] ? 'valid' : 'error', implode('; ', $errors));

            if ($errors === []) {
                $validRows[] = $preview;
            } else {
                $errorRows[] = $preview;
            }
        }

        $sortedNewDepartments = array_keys($newDepartments);
        sort($sortedNewDepartments, SORT_STRING);

        return new ValidationPreview(validRows: $validRows, errorRows: $errorRows, newDepartments: $sortedNewDepartments, total: count($rows));
    }

    /**
     * @return list<string>
     */
    private function parseRoles(string $rolesRaw): array
    {
        if ($rolesRaw === '') {
            return [RoleName::EMPLOYEE->value];
        }

        $roles = [];
        foreach (explode(',', $rolesRaw) as $raw) {
            if (trim($raw) === '') {
                continue;
            }
            $roles[] = $this->normalizeRole($raw);
        }

        return $roles;
    }

    private function normalizeRole(string $raw): string
    {
        $normalized = strtoupper(str_replace(' ', '_', trim($raw)));

        return self::ROLE_ALIASES[$normalized] ?? $normalized;
    }
}
