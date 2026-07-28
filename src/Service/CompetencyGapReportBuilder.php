<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\AppraisalCycle;
use App\Enum\AppraisalFormType;
use App\Repository\CompetencyRatingRepository;

/**
 * Port of apps.reports.views.CompetencyGapReportView._build_payload.
 */
final class CompetencyGapReportBuilder
{
    public function __construct(
        private readonly CompetencyRatingRepository $competencyRatings,
        private readonly ReportCalculations $calculations,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(AppraisalCycle $cycle, ?AppraisalFormType $formType): array
    {
        $rows = $this->competencyRatings->avgManagerRatingByCompetencyForFinalised($cycle, $formType);

        $gaps = array_map(fn (array $row) => [
            'competency_id' => $row['competencyId'],
            'competency_name' => $row['competencyName'],
            'avg_manager_rating' => $this->calculations->roundHalfEven($row['avgManagerRating'], 2),
            'appraisal_count' => $row['appraisalCount'],
        ], $rows);

        return [
            'cycle_id' => (string) $cycle->getId(),
            'form_type' => $formType?->value,
            'gaps' => $gaps,
        ];
    }
}
