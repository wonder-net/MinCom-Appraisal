<?php

declare(strict_types=1);

namespace App\BulkImport;

/**
 * Port of apps.accounts.bulk_import_service.RowPreview.
 */
final class RowPreview
{
    public function __construct(
        public readonly int $rowNumber,
        public readonly string $employeeNumber,
        public readonly string $fullName,
        public readonly string $email,
        public readonly string $status, // 'valid' | 'error'
        public readonly string $error,
    ) {
    }

    /**
     * @return array{row_number: int, employee_number: string, full_name: string, email: string, status: string, error: string}
     */
    public function toArray(): array
    {
        return [
            'row_number' => $this->rowNumber,
            'employee_number' => $this->employeeNumber,
            'full_name' => $this->fullName,
            'email' => $this->email,
            'status' => $this->status,
            'error' => $this->error,
        ];
    }
}
