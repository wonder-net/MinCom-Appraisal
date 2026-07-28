<?php

declare(strict_types=1);

namespace App\Message;

/**
 * Port of apps.appraisals.tasks.execute_appraisal_bulk_import,
 * dispatched by AppraisalBulkImportConfirmController.
 */
final class ExecuteAppraisalBulkImportMessage
{
    public function __construct(public readonly string $jobId)
    {
    }
}
