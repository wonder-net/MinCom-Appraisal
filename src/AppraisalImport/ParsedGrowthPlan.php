<?php

declare(strict_types=1);

namespace App\AppraisalImport;

/**
 * Port of excel_parser.ParsedGrowthPlan. Parsed for preview purposes
 * (data_summary.has_growth_plan) and for the executor's signature
 * date/appraiser-name fallback — persisting it into GrowthPlan/
 * StrengthWeakness/TrainingNeed/CareerPlan/DevelopmentNeed rows is
 * deferred until the `growth_plans` app is ported (see
 * AppraisalBulkImportExecutor's class docblock).
 */
final class ParsedGrowthPlan
{
    /**
     * @param list<ParsedStrengthWeakness> $strengths
     * @param list<ParsedStrengthWeakness> $weaknesses
     * @param list<ParsedTrainingNeed> $trainingNeeds
     * @param list<ParsedCareerPlan> $careerPlans
     * @param list<ParsedDevelopmentNeed> $developmentNeeds
     * @param list<string> $emptySections
     */
    public function __construct(
        public readonly string $overallAssessment,
        public readonly array $strengths,
        public readonly array $weaknesses,
        public readonly array $trainingNeeds,
        public readonly array $careerPlans,
        public readonly array $developmentNeeds,
        public readonly array $emptySections,
        public readonly string $appraiseeSignName = '',
        public readonly string $appraiseeSignDate = '',
        public readonly string $appraiserSignName = '',
        public readonly string $appraiserSignDate = '',
    ) {
    }
}
