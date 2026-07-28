<?php

declare(strict_types=1);

namespace App\Message;

/**
 * Port of apps.accounts.tasks.commit_user_bulk_import (async job
 * pipeline), dispatched by UserBulkImportJobCommitController.
 */
final class CommitUserBulkImportMessage
{
    public function __construct(public readonly string $jobId)
    {
    }
}
