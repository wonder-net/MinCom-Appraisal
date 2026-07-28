<?php

declare(strict_types=1);

namespace App\AppraisalImport;

/**
 * Port of AppraisalBulkImportExecutor.execute_single's return dict.
 * Exactly one of ($appraisalId set) or ($error set).
 */
final class ExecutorResult
{
    public static function success(string $appraisalId, int $kdCount, bool $created): self
    {
        $result = new self();
        $result->appraisalId = $appraisalId;
        $result->kdCount = $kdCount;
        $result->created = $created;

        return $result;
    }

    public static function failure(string $error): self
    {
        $result = new self();
        $result->error = $error;

        return $result;
    }

    public ?string $appraisalId = null;
    public int $kdCount = 0;
    public bool $created = false;
    public ?string $error = null;

    private function __construct()
    {
    }
}
