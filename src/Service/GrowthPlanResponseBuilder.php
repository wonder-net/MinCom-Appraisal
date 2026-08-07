<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\CareerPlan;
use App\Entity\DevelopmentNeed;
use App\Entity\GrowthPlan;
use App\Entity\StrengthWeakness;
use App\Entity\TrainingNeed;
use App\Repository\CareerPlanRepository;
use App\Repository\DevelopmentNeedRepository;
use App\Repository\StrengthWeaknessRepository;
use App\Repository\TrainingNeedRepository;

/**
 * Port of apps.growth_plans.serializers.GrowthPlanSerializer (+ its 4
 * nested child read serializers).
 */
final class GrowthPlanResponseBuilder
{
    public function __construct(
        private readonly StrengthWeaknessRepository $strengthsWeaknesses,
        private readonly TrainingNeedRepository $trainingNeeds,
        private readonly CareerPlanRepository $careerPlans,
        private readonly DevelopmentNeedRepository $developmentNeeds,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(GrowthPlan $growthPlan): array
    {
        return [
            'id' => (string) $growthPlan->getId(),
            'appraisal_id' => (string) $growthPlan->getAppraisal()->getId(),
            'overall_assessment' => $growthPlan->getOverallAssessment(),
            // HR change request #11.
            'promotion_recommendation' => $growthPlan->getPromotionRecommendation(),
            // 9-box talent grid (product roadmap item).
            'potential_rating' => $growthPlan->getPotentialRating()?->value,
            'strengths_weaknesses' => array_map(
                $this->buildStrengthWeakness(...),
                $this->strengthsWeaknesses->findByGrowthPlanOrdered($growthPlan),
            ),
            'training_needs' => array_map(
                $this->buildTrainingNeed(...),
                $this->trainingNeeds->findByGrowthPlanOrdered($growthPlan),
            ),
            'career_plans' => array_map(
                $this->buildCareerPlan(...),
                $this->careerPlans->findByGrowthPlanOrdered($growthPlan),
            ),
            'development_needs' => array_map(
                $this->buildDevelopmentNeed(...),
                $this->developmentNeeds->findByGrowthPlanOrdered($growthPlan),
            ),
            'created_at' => $growthPlan->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'updated_at' => $growthPlan->getUpdatedAt()->format(\DateTimeInterface::ATOM),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function buildStrengthWeakness(StrengthWeakness $sw): array
    {
        return [
            'id' => (string) $sw->getId(),
            'type' => $sw->getType()->value,
            'description' => $sw->getDescription(),
            'sort_order' => $sw->getSortOrder(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function buildTrainingNeed(TrainingNeed $tn): array
    {
        return [
            'id' => (string) $tn->getId(),
            'type' => $tn->getType()->value,
            'description' => $tn->getDescription(),
            'course_title' => $tn->getCourseTitle(),
            'institution' => $tn->getInstitution(),
            'priority' => $tn->getPriority()->value,
            'sort_order' => $tn->getSortOrder(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function buildCareerPlan(CareerPlan $cp): array
    {
        return [
            'id' => (string) $cp->getId(),
            'aspired_role' => $cp->getAspiredRole(),
            'priority' => $cp->getPriority(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function buildDevelopmentNeed(DevelopmentNeed $dn): array
    {
        return [
            'id' => (string) $dn->getId(),
            'description' => $dn->getDescription(),
            'priority' => $dn->getPriority()->value,
        ];
    }
}
