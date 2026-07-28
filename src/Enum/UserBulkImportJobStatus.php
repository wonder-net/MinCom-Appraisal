<?php

declare(strict_types=1);

namespace App\Enum;

/**
 * Port of apps.accounts.models.UserBulkImportJob.Status (async bulk-import
 * path, <=10,000 rows). State transitions:
 *
 *   PENDING_VALIDATION -> VALIDATED -> COMMITTING -> SUCCEEDED
 *                                                 |-> PARTIAL_SUCCESS
 *                                                 |-> FAILED
 *   PENDING_VALIDATION -> VALIDATION_FAILED
 *   PENDING_VALIDATION -> FAILED (parser exception or worker crash)
 */
enum UserBulkImportJobStatus: string
{
    case PENDING_VALIDATION = 'PENDING_VALIDATION';
    case VALIDATED = 'VALIDATED';
    case VALIDATION_FAILED = 'VALIDATION_FAILED';
    case COMMITTING = 'COMMITTING';
    case SUCCEEDED = 'SUCCEEDED';
    case PARTIAL_SUCCESS = 'PARTIAL_SUCCESS';
    case FAILED = 'FAILED';

    /**
     * Port of Django's Status.label (TextChoices human-readable labels),
     * used by the user_bulk_import_completed notification email.
     */
    public function label(): string
    {
        return match ($this) {
            self::PENDING_VALIDATION => 'Pending validation',
            self::VALIDATED => 'Validated',
            self::VALIDATION_FAILED => 'Validation failed',
            self::COMMITTING => 'Committing',
            self::SUCCEEDED => 'Succeeded',
            self::PARTIAL_SUCCESS => 'Partial success',
            self::FAILED => 'Failed',
        };
    }
}
