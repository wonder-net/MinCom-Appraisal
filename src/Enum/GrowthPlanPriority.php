<?php

declare(strict_types=1);

namespace App\Enum;

/**
 * Port of apps.growth_plans.models.CareerPlan.Priority and
 * DevelopmentNeed.Priority — Django declares these as two separate,
 * textually-identical TextChoices classes; consolidated here since
 * there's no behavioural difference. Required (no blank) for
 * DevelopmentNeed. CareerPlan's write serializer uniquely allows a
 * blank priority (required=False, allow_blank=True, default="") — see
 * CareerPlan entity's docblock for why that field stays a plain string
 * column rather than this enum.
 */
enum GrowthPlanPriority: string
{
    case FIRST = 'FIRST';
    case SECOND = 'SECOND';
    case THIRD = 'THIRD';
}
