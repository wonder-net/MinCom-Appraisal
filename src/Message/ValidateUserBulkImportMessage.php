<?php

declare(strict_types=1);

namespace App\Message;

/**
 * Port of apps.accounts.tasks.validate_user_bulk_import (async job
 * pipeline), dispatched by UserBulkImportJobCreateController.
 */
final class ValidateUserBulkImportMessage
{
    public function __construct(public readonly string $jobId)
    {
    }
}
