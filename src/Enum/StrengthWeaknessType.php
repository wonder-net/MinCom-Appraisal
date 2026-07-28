<?php

declare(strict_types=1);

namespace App\Enum;

/**
 * Port of apps.growth_plans.models.StrengthWeakness.SWType.
 */
enum StrengthWeaknessType: string
{
    case STRENGTH = 'STRENGTH';
    case WEAKNESS = 'WEAKNESS';
}
