<?php

declare(strict_types=1);

namespace App\GrowthPlan;

/**
 * `priority` is a validated-but-possibly-blank string — see
 * App\Entity\CareerPlan's docblock for why this field alone tolerates
 * an empty value.
 */
final class ValidatedCareerPlan
{
    public function __construct(
        public readonly string $aspiredRole,
        public readonly string $priority,
    ) {
    }
}
