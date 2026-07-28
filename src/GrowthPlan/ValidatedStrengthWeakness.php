<?php

declare(strict_types=1);

namespace App\GrowthPlan;

use App\Enum\StrengthWeaknessType;

final class ValidatedStrengthWeakness
{
    public function __construct(
        public readonly StrengthWeaknessType $type,
        public readonly string $description,
        public readonly int $sortOrder,
    ) {
    }
}
