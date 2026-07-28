<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\AppraisalCycle;
use App\Entity\CareerPlan;
use App\Repository\CareerPlanRepository;

/**
 * Port of apps.reports.views.{CareerAspirationPipelineView, _aggregate_aspired_roles}.
 * Django groups in Python because aspired_role is encrypted there; the
 * Symfony port has deferred column encryption on CareerPlan.aspiredRole,
 * but keeps this aggregation in PHP anyway (rather than switching to SQL
 * GROUP BY) since normalisation (strip + title-case) must happen before
 * grouping — matching Django's exact tie-breaking behaviour (insertion
 * order for both role-count ties and per-role priority ties) is far
 * simpler to reason about here than via SQL.
 */
final class CareerAspirationPipelineBuilder
{
    public function __construct(private readonly CareerPlanRepository $careerPlans)
    {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(?AppraisalCycle $cycle): array
    {
        if ($cycle === null) {
            return ['cycle_id' => null, 'aspired_roles' => []];
        }

        $roleCounts = [];
        $rolePriorityCounts = [];

        foreach ($this->careerPlans->findForFinalisedByCycle($cycle) as $careerPlan) {
            $normalised = $this->pythonTitleCase(trim($careerPlan->getAspiredRole()));
            if ($normalised === '') {
                continue;
            }

            $roleCounts[$normalised] = ($roleCounts[$normalised] ?? 0) + 1;
            $priority = $careerPlan->getPriority();
            $rolePriorityCounts[$normalised][$priority] = ($rolePriorityCounts[$normalised][$priority] ?? 0) + 1;
        }

        $rows = [];
        foreach ($roleCounts as $role => $count) {
            $rows[] = [
                'aspired_role' => $role,
                'count' => $count,
                'top_priority' => $this->mostCommonPriority($rolePriorityCounts[$role]),
            ];
        }

        usort($rows, static fn (array $a, array $b) => $b['count'] <=> $a['count']);

        return [
            'cycle_id' => (string) $cycle->getId(),
            'aspired_roles' => $rows,
        ];
    }

    /**
     * @param array<string, int> $priorityCounts insertion-ordered by first occurrence
     */
    private function mostCommonPriority(array $priorityCounts): string
    {
        $best = null;
        $bestCount = -1;
        foreach ($priorityCounts as $priority => $count) {
            if ($count > $bestCount) {
                $best = $priority;
                $bestCount = $count;
            }
        }

        return $best;
    }

    /**
     * Port of Python's str.title(): uppercases the first letter of each
     * run of letters, lowercases the rest — unlike PHP's ucwords(),
     * ANY non-letter character (digits, punctuation, apostrophes)
     * resets capitalisation, not just whitespace.
     */
    private function pythonTitleCase(string $value): string
    {
        $result = '';
        $prevIsAlpha = false;
        foreach (preg_split('//u', $value, -1, \PREG_SPLIT_NO_EMPTY) as $char) {
            $isAlpha = (bool) preg_match('/\p{L}/u', $char);
            $result .= $isAlpha ? ($prevIsAlpha ? mb_strtolower($char) : mb_strtoupper($char)) : $char;
            $prevIsAlpha = $isAlpha;
        }

        return $result;
    }
}
