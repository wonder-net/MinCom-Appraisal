<?php

declare(strict_types=1);

namespace App\BulkImport;

use Symfony\Component\HttpFoundation\File\UploadedFile;

/**
 * Port of apps.accounts.serializers.BulkImportUploadSerializer.validate_file:
 * extension + size checks shared by the legacy and async upload endpoints
 * (which differ only in the size cap).
 */
final class UploadedSpreadsheetValidator
{
    public function validate(?UploadedFile $file, int $maxBytes): ?string
    {
        if ($file === null) {
            return 'This field is required.';
        }

        $name = strtolower($file->getClientOriginalName());
        if (!str_ends_with($name, '.xlsx') && !str_ends_with($name, '.csv')) {
            return 'Only .xlsx and .csv files are supported.';
        }

        if ($file->getSize() > $maxBytes) {
            return sprintf('File size exceeds the %d MB limit.', intdiv($maxBytes, 1024 * 1024));
        }

        return null;
    }
}
