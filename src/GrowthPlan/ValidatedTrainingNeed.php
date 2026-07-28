<?php

declare(strict_types=1);

namespace App\GrowthPlan;

use App\Enum\TrainingNeedPriority;
use App\Enum\TrainingNeedType;

final class ValidatedTrainingNeed
{
    public function __construct(
        public readonly TrainingNeedType $type,
        public readonly string $description,
        public readonly ?string $courseTitle,
        public readonly ?string $institution,
        public readonly TrainingNeedPriority $priority,
        public readonly int $sortOrder,
    ) {
    }
}
