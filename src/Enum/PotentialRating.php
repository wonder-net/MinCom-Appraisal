<?php

declare(strict_types=1);

namespace App\Enum;

/**
 * The "potential" axis of the 9-box talent grid (product roadmap item,
 * not part of the original 11 HR change requests) — set by the manager
 * on GrowthPlan alongside the rest of their growth-planning input,
 * independent of any performance score. There is no equivalent field
 * anywhere else in the data model; performance (the grid's other axis)
 * is derived entirely from the appraisal's existing total_score
 * (see NineBoxReportBuilder), which needed no new field at all.
 */
enum PotentialRating: string
{
    case LOW = 'LOW';
    case MEDIUM = 'MEDIUM';
    case HIGH = 'HIGH';

    public function label(): string
    {
        return match ($this) {
            self::LOW => 'Low Potential',
            self::MEDIUM => 'Medium Potential',
            self::HIGH => 'High Potential',
        };
    }
}
