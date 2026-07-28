<?php

declare(strict_types=1);

namespace App\AppraisalImport;

/**
 * Port of appraisal_bulk_import_service.BulkImportPreview.
 */
final class BulkImportPreview
{
    /** @var list<FilePreview> */
    public array $files = [];
    public int $matched = 0;
    public int $suggested = 0;
    public int $unmatched = 0;
    public int $errors = 0;
    public int $scoreDiscrepancies = 0;

    public function __construct(public readonly int $totalFiles)
    {
    }
}
