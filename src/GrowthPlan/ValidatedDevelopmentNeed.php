<?php

declare(strict_types=1);

namespace App\GrowthPlan;

use App\Enum\GrowthPlanPriority;

final class ValidatedDevelopmentNeed
{
    public function __construct(
        public readonly string $description,
        public readonly GrowthPlanPriority $priority,
    ) {
    }
}
