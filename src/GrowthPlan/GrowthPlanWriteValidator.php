<?php

declare(strict_types=1);

namespace App\GrowthPlan;

use App\Enum\GrowthPlanPriority;
use App\Enum\StrengthWeaknessType;
use App\Enum\TrainingNeedPriority;
use App\Enum\TrainingNeedType;
use App\Validation\ValidationErrorFactory;

/**
 * Port of apps.growth_plans.serializers.{GrowthPlanWriteSerializer,
 * validate_training_need_priority_uniqueness} plus the 4 nested child
 * write serializers. Used identically for POST (create) and PATCH
 * (partial_update) — the caller decides what "field absent" means for
 * each action (see GrowthPlanWriteData's docblock).
 */
final class GrowthPlanWriteValidator
{
    /**
     * @param array<string, mixed> $payload
     */
    public function validate(array $payload): GrowthPlanWriteData
    {
        $errors = [];

        $hasOverallAssessment = array_key_exists('overall_assessment', $payload);
        $overallAssessment = '';
        if ($hasOverallAssessment) {
            $raw = $payload['overall_assessment'];
            if (!is_string($raw)) {
                $errors['overall_assessment'] = 'Not a valid string.';
            } else {
                $overallAssessment = $raw;
            }
        }

        // HR change request #11: promotion recommendation, validated the
        // same way as overall_assessment (an optional free-text field).
        $hasPromotionRecommendation = array_key_exists('promotion_recommendation', $payload);
        $promotionRecommendation = '';
        if ($hasPromotionRecommendation) {
            $raw = $payload['promotion_recommendation'];
            if (!is_string($raw)) {
                $errors['promotion_recommendation'] = 'Not a valid string.';
            } else {
                $promotionRecommendation = $raw;
            }
        }

        $hasSw = array_key_exists('strengths_weaknesses', $payload);
        $strengthsWeaknesses = $hasSw ? $this->validateStrengthsWeaknesses($payload['strengths_weaknesses'], $errors) : [];

        $hasTn = array_key_exists('training_needs', $payload);
        $trainingNeeds = $hasTn ? $this->validateTrainingNeeds($payload['training_needs'], $errors) : [];

        $hasCp = array_key_exists('career_plans', $payload);
        $careerPlans = $hasCp ? $this->validateCareerPlans($payload['career_plans'], $errors) : [];

        $hasDn = array_key_exists('development_needs', $payload);
        $developmentNeeds = $hasDn ? $this->validateDevelopmentNeeds($payload['development_needs'], $errors) : [];

        if ($errors !== []) {
            throw ValidationErrorFactory::fields($errors);
        }

        return new GrowthPlanWriteData(
            hasOverallAssessment: $hasOverallAssessment,
            overallAssessment: $overallAssessment,
            hasPromotionRecommendation: $hasPromotionRecommendation,
            promotionRecommendation: $promotionRecommendation,
            hasStrengthsWeaknesses: $hasSw,
            strengthsWeaknesses: $strengthsWeaknesses,
            hasTrainingNeeds: $hasTn,
            trainingNeeds: $trainingNeeds,
            hasCareerPlans: $hasCp,
            careerPlans: $careerPlans,
            hasDevelopmentNeeds: $hasDn,
            developmentNeeds: $developmentNeeds,
        );
    }

    /**
     * @param array<string, string> $errors
     * @return list<ValidatedStrengthWeakness>
     */
    private function validateStrengthsWeaknesses(mixed $items, array &$errors): array
    {
        if (!is_array($items)) {
            $errors['strengths_weaknesses'] = 'Expected a list.';

            return [];
        }

        $result = [];
        foreach (array_values($items) as $i => $item) {
            if (!is_array($item) || trim((string) ($item['description'] ?? '')) === '') {
                continue; // Blank placeholder row — silently dropped, matching to_internal_value().
            }

            $type = is_string($item['type'] ?? null) ? StrengthWeaknessType::tryFrom($item['type']) : null;
            if ($type === null) {
                $errors['strengths_weaknesses'] = sprintf('Item %d: "%s" is not a valid choice for type.', $i, (string) ($item['type'] ?? ''));
                continue;
            }

            $rawSortOrder = $item['sort_order'] ?? 0;
            $sortOrder = is_int($rawSortOrder) ? $rawSortOrder : 0;
            $result[] = new ValidatedStrengthWeakness($type, (string) $item['description'], $sortOrder);
        }

        return $result;
    }

    /**
     * @param array<string, string> $errors
     * @return list<ValidatedTrainingNeed>
     */
    private function validateTrainingNeeds(mixed $items, array &$errors): array
    {
        if (!is_array($items)) {
            $errors['training_needs'] = 'Expected a list.';

            return [];
        }

        $result = [];
        foreach (array_values($items) as $i => $item) {
            if (!is_array($item) || trim((string) ($item['description'] ?? '')) === '') {
                continue;
            }

            $type = is_string($item['type'] ?? null) ? TrainingNeedType::tryFrom($item['type']) : null;
            if ($type === null) {
                $errors['training_needs'] = sprintf('Item %d: "%s" is not a valid choice for type.', $i, (string) ($item['type'] ?? ''));
                continue;
            }

            $priority = is_string($item['priority'] ?? null) ? TrainingNeedPriority::tryFrom($item['priority']) : null;
            if ($priority === null) {
                $errors['training_needs'] = sprintf('Item %d: "%s" is not a valid choice for priority.', $i, (string) ($item['priority'] ?? ''));
                continue;
            }

            $courseTitle = isset($item['course_title']) && is_string($item['course_title']) && $item['course_title'] !== '' ? $item['course_title'] : null;
            $institution = isset($item['institution']) && is_string($item['institution']) && $item['institution'] !== '' ? $item['institution'] : null;
            $rawSortOrder = $item['sort_order'] ?? 0;
            $sortOrder = is_int($rawSortOrder) ? $rawSortOrder : 0;

            $result[] = new ValidatedTrainingNeed($type, (string) $item['description'], $courseTitle, $institution, $priority, $sortOrder);
        }

        if ($errors === [] || !isset($errors['training_needs'])) {
            $duplicate = $this->findDuplicateTrainingNeedPriority($result);
            if ($duplicate !== null) {
                $errors['training_needs'] = sprintf('Duplicate training need priority within type: %s with priority %s', $duplicate[0], $duplicate[1]);
            }
        }

        return $result;
    }

    /**
     * Port of validate_training_need_priority_uniqueness: no two
     * entries of the same type may share the same priority.
     *
     * @param list<ValidatedTrainingNeed> $items
     * @return array{0: string, 1: string}|null
     */
    private function findDuplicateTrainingNeedPriority(array $items): ?array
    {
        $seen = [];
        foreach ($items as $item) {
            $key = $item->type->value.'|'.$item->priority->value;
            if (isset($seen[$key])) {
                return [$item->type->value, $item->priority->value];
            }
            $seen[$key] = true;
        }

        return null;
    }

    /**
     * @param array<string, string> $errors
     * @return list<ValidatedCareerPlan>
     */
    private function validateCareerPlans(mixed $items, array &$errors): array
    {
        if (!is_array($items)) {
            $errors['career_plans'] = 'Expected a list.';

            return [];
        }

        $result = [];
        foreach (array_values($items) as $i => $item) {
            if (!is_array($item) || trim((string) ($item['aspired_role'] ?? '')) === '') {
                continue;
            }

            $rawPriority = is_string($item['priority'] ?? null) ? trim($item['priority']) : '';
            if ($rawPriority !== '' && GrowthPlanPriority::tryFrom($rawPriority) === null) {
                $errors['career_plans'] = sprintf('Item %d: "%s" is not a valid choice for priority.', $i, $rawPriority);
                continue;
            }

            $result[] = new ValidatedCareerPlan((string) $item['aspired_role'], $rawPriority);
        }

        return $result;
    }

    /**
     * @param array<string, string> $errors
     * @return list<ValidatedDevelopmentNeed>
     */
    private function validateDevelopmentNeeds(mixed $items, array &$errors): array
    {
        if (!is_array($items)) {
            $errors['development_needs'] = 'Expected a list.';

            return [];
        }

        $result = [];
        foreach (array_values($items) as $i => $item) {
            if (!is_array($item) || trim((string) ($item['description'] ?? '')) === '') {
                continue;
            }

            $priority = is_string($item['priority'] ?? null) ? GrowthPlanPriority::tryFrom($item['priority']) : null;
            if ($priority === null) {
                $errors['development_needs'] = sprintf('Item %d: "%s" is not a valid choice for priority.', $i, (string) ($item['priority'] ?? ''));
                continue;
            }

            $result[] = new ValidatedDevelopmentNeed((string) $item['description'], $priority);
        }

        return $result;
    }
}
