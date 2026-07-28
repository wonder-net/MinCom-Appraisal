<?php

declare(strict_types=1);

namespace App\Enum;

/**
 * Port of apps.appraisals.models.Signature.SignatureAction.
 */
enum SignatureAction: string
{
    case ACCEPT = 'ACCEPT';
    case REJECT = 'REJECT';
    case COMMENTS_ATTACHED = 'COMMENTS_ATTACHED';

    /**
     * Matches Django's TextChoices .label — used by the PDF reports
     * (appraisal + audit compliance), which display the human label
     * rather than the raw enum value.
     */
    public function label(): string
    {
        return match ($this) {
            self::ACCEPT => 'Accept',
            self::REJECT => 'Reject',
            self::COMMENTS_ATTACHED => 'Comments Attached',
        };
    }
}
