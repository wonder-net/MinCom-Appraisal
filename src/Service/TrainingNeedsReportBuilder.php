<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\AppraisalCycle;
use App\Entity\TrainingNeed;
use App\Enum\TrainingNeedPriority;
use App\Repository\TrainingNeedRepository;

/**
 * Port of apps.reports.views.TrainingNeedsReportView +
 * apps.reports.services.{group_training_needs_by_priority,
 * build_recommended_courses, build_training_needs_payload}.
 */
final class TrainingNeedsReportBuilder
{
    /**
     * Priorities that must always appear in the response, even with a
     * zero count. TrainingNeedPriority::FOURTH is deliberately excluded
     * here — Django's ALL_TRAINING_PRIORITIES only lists FIRST/SECOND/
     * THIRD, so any FOURTH-priority row is silently dropped from the
     * grouped output, matched exactly by omitting it from this list.
     */
    private const REPORTED_PRIORITIES = [
        TrainingNeedPriority::FIRST,
        TrainingNeedPriority::SECOND,
        TrainingNeedPriority::THIRD,
    ];

    public function __construct(private readonly TrainingNeedRepository $trainingNeeds)
    {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(?AppraisalCycle $cycle): array
    {
        if ($cycle === null) {
            return [
                'cycle_id' => null,
                'training_needs' => $this->groupByPriority([]),
                'recommended_courses' => [],
            ];
        }

        $needs = $this->trainingNeeds->findByCycle($cycle);
        $courses = $this->trainingNeeds->findRecommendedCoursesByCycle($cycle);

        return [
            'cycle_id' => (string) $cycle->getId(),
            'training_needs' => $this->groupByPriority($needs),
            'recommended_courses' => array_map(fn (TrainingNeed $tn) => [
                'title' => $tn->getCourseTitle() ?? '',
                'institution' => $tn->getInstitution() ?? '',
                'priority' => $tn->getPriority()->value,
            ], $courses),
        ];
    }

    /**
     * @param list<TrainingNeed> $needs
     * @return list<array{priority: string, count: int, descriptions: list<string>}>
     */
    private function groupByPriority(array $needs): array
    {
        $descriptionsByPriority = [];
        foreach (self::REPORTED_PRIORITIES as $priority) {
            $descriptionsByPriority[$priority->value] = [];
        }

        foreach ($needs as $need) {
            $priority = $need->getPriority();
            if (!in_array($priority, self::REPORTED_PRIORITIES, true)) {
                continue;
            }
            $descriptionsByPriority[$priority->value][] = $need->getDescription();
        }

        return array_map(static fn (string $priority, array $descriptions) => [
            'priority' => $priority,
            'count' => count($descriptions),
            'descriptions' => $descriptions,
        ], array_keys($descriptionsByPriority), $descriptionsByPriority);
    }
}
