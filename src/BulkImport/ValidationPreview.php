<?php

declare(strict_types=1);

namespace App\BulkImport;

/**
 * Port of apps.accounts.bulk_import_service.ValidationPreview.
 *
 * newDepartments is always empty — Department doesn't exist in this port
 * yet (see BulkImportValidator's docblock).
 */
final class ValidationPreview
{
    /**
     * @param list<RowPreview> $validRows
     * @param list<RowPreview> $errorRows
     * @param list<string> $newDepartments
     */
    public function __construct(
        public readonly array $validRows = [],
        public readonly array $errorRows = [],
        public readonly array $newDepartments = [],
        public readonly int $total = 0,
    ) {
    }

    /**
     * @return array{valid_rows: list<array<string, mixed>>, error_rows: list<array<string, mixed>>, new_departments: list<string>, total: int}
     */
    public function toArray(): array
    {
        return [
            'valid_rows' => array_map(static fn (RowPreview $r) => $r->toArray(), $this->validRows),
            'error_rows' => array_map(static fn (RowPreview $r) => $r->toArray(), $this->errorRows),
            'new_departments' => $this->newDepartments,
            'total' => $this->total,
        ];
    }
}
