<?php

declare(strict_types=1);

namespace App\Enum;

/**
 * Port of apps.growth_plans.models.TrainingNeed.Priority — has a
 * FOURTH case (added by migration 0003) that CareerPlan/DevelopmentNeed's
 * separate (but otherwise identical) Priority choices classes lack, so
 * this is kept distinct from GrowthPlanPriority rather than shared.
 */
enum TrainingNeedPriority: string
{
    case FIRST = 'FIRST';
    case SECOND = 'SECOND';
    case THIRD = 'THIRD';
    case FOURTH = 'FOURTH';
}
