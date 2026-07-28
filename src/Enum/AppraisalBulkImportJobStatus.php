<?php

declare(strict_types=1);

namespace App\Enum;

/**
 * Port of apps.appraisals.models.AppraisalBulkImportJob.Status.
 */
enum AppraisalBulkImportJobStatus: string
{
    case PENDING = 'PENDING';
    case PROCESSING = 'PROCESSING';
    case COMPLETED = 'COMPLETED';
    case FAILED = 'FAILED';
}
