<?php

declare(strict_types=1);

namespace App\BulkImport;

/**
 * Port of apps.accounts.bulk_import_service.CreationResult.
 */
final class CreationResult
{
    /**
     * @param list<array{row_number: int, employee_number: string, email: string, error: string}> $failedRows
     */
    public function __construct(
        public readonly int $createdCount = 0,
        public readonly int $failedCount = 0,
        public readonly int $totalRows = 0,
        public readonly array $failedRows = [],
    ) {
    }
}
