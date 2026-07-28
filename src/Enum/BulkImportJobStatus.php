<?php

declare(strict_types=1);

namespace App\Enum;

/**
 * Port of apps.accounts.models.BulkImportJob.Status (legacy synchronous
 * bulk-import path, <=500 rows).
 */
enum BulkImportJobStatus: string
{
    case PENDING = 'PENDING';
    case PROCESSING = 'PROCESSING';
    case COMPLETED = 'COMPLETED';
    case FAILED = 'FAILED';
}
