<?php

declare(strict_types=1);

namespace App\GrowthPlan;

/**
 * Result of GrowthPlanWriteValidator::validate(). Each `has*` flag
 * mirrors Django's `"key" in request.data` presence check, used by
 * partial_update (PATCH) to decide which parts of the growth plan to
 * touch; create (POST) instead treats every field as present with an
 * empty-array/blank-string default, matching
 * GrowthPlanWriteSerializer's `validated_data.get(key, [])` fallback.
 */
final class GrowthPlanWriteData
{
    /**
     * @param list<ValidatedStrengthWeakness> $strengthsWeaknesses
     * @param list<ValidatedTrainingNeed> $trainingNeeds
     * @param list<ValidatedCareerPlan> $careerPlans
     * @param list<ValidatedDevelopmentNeed> $developmentNeeds
     */
    public function __construct(
        public readonly bool $hasOverallAssessment,
        public readonly string $overallAssessment,
        public readonly bool $hasPromotionRecommendation,
        public readonly string $promotionRecommendation,
        public readonly bool $hasStrengthsWeaknesses,
        public readonly array $strengthsWeaknesses,
        public readonly bool $hasTrainingNeeds,
        public readonly array $trainingNeeds,
        public readonly bool $hasCareerPlans,
        public readonly array $careerPlans,
        public readonly bool $hasDevelopmentNeeds,
        public readonly array $developmentNeeds,
    ) {
    }
}
