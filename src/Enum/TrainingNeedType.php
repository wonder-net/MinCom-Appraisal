<?php

declare(strict_types=1);

namespace App\Enum;

/**
 * Port of apps.growth_plans.models.TrainingNeed.TNType.
 */
enum TrainingNeedType: string
{
    case ON_THE_JOB = 'ON_THE_JOB';
    case RECOMMENDED_COURSE = 'RECOMMENDED_COURSE';
}
