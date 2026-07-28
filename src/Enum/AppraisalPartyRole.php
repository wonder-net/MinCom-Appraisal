<?php

declare(strict_types=1);

namespace App\Enum;

/**
 * Port of apps.appraisals.models.Comment.AuthorRole and
 * Signature.SignerRole — Django declares these as two separate
 * TextChoices classes with identical values (APPRAISER/APPRAISEE, one
 * per model). Consolidated into a single enum here since there's no
 * behavioural difference, reused by both the Comment and Signature
 * entities.
 */
enum AppraisalPartyRole: string
{
    case APPRAISER = 'APPRAISER';
    case APPRAISEE = 'APPRAISEE';

    /**
     * Matches Django's TextChoices .label for both source enums
     * (identical in each: APPRAISER -> "Appraisor" — not a typo,
     * matched verbatim — APPRAISEE -> "Appraisee").
     */
    public function label(): string
    {
        return match ($this) {
            self::APPRAISER => 'Appraisor',
            self::APPRAISEE => 'Appraisee',
        };
    }
}
