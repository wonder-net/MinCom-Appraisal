<?php

declare(strict_types=1);

namespace App\Message;

/**
 * Port of apps.accounts.tasks.execute_bulk_import (legacy synchronous
 * bulk-import path, dispatched by AdminBulkImportConfirmController).
 */
final class ExecuteBulkImportMessage
{
    public function __construct(public readonly string $jobId)
    {
    }
}
