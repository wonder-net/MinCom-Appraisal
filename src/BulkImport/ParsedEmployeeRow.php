<?php

declare(strict_types=1);

namespace App\BulkImport;

/**
 * Port of apps.accounts.bulk_import_parser.ParsedEmployeeRow.
 */
final class ParsedEmployeeRow
{
    public function __construct(
        public readonly int $rowNumber,
        public readonly string $employeeNumber,
        public readonly string $fullName,
        public readonly string $email,
        public readonly string $jobTitle,
        public readonly string $department,
        public readonly string $jobFamily,
        public readonly string $location,
        public readonly string $appraisorEmployeeNumber,
        public readonly string $rolesRaw,
    ) {
    }
}
