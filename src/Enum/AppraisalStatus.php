<?php

declare(strict_types=1);

namespace App\Enum;

/**
 * Port of apps.appraisals.models.Appraisal.Status: eight workflow states
 * plus EXCLUDED and INCOMPLETE for administrative overrides.
 */
enum AppraisalStatus: string
{
    case SELF_ASSESSMENT = 'SELF_ASSESSMENT';
    case MANAGER_REVIEW = 'MANAGER_REVIEW';
    case DISCUSSION = 'DISCUSSION';
    case GROWTH_PLANNING = 'GROWTH_PLANNING';
    case PENDING_SIGNOFF = 'PENDING_SIGNOFF';
    case SIGNED_OFF = 'SIGNED_OFF';
    case DISPUTED = 'DISPUTED';
    case FINALISED = 'FINALISED';
    case EXCLUDED = 'EXCLUDED';
    case INCOMPLETE = 'INCOMPLETE';

    /**
     * Matches Django's TextChoices .label — used in transition-error
     * messages (e.g. "Transition from Self Assessment to Discussion is
     * not allowed.").
     */
    public function label(): string
    {
        return match ($this) {
            self::SELF_ASSESSMENT => 'Self Assessment',
            self::MANAGER_REVIEW => 'Manager Review',
            self::DISCUSSION => 'Discussion',
            self::GROWTH_PLANNING => 'Growth Planning',
            self::PENDING_SIGNOFF => 'Pending Sign-Off',
            self::SIGNED_OFF => 'Signed Off',
            self::DISPUTED => 'Disputed',
            self::FINALISED => 'Finalised',
            self::EXCLUDED => 'Excluded',
            self::INCOMPLETE => 'Incomplete',
        };
    }
}
