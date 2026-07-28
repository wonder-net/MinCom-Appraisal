<?php

declare(strict_types=1);

namespace App\AppraisalImport;

/**
 * Port of excel_parser.ParsedAppraisalSheet.
 */
final class ParsedAppraisalSheet
{
    /**
     * @param list<ParsedKd> $keyDeliverables
     * @param list<ParsedCompetencyRating> $competencyRatings
     * @param list<ParsedComment> $comments
     */
    public function __construct(
        public readonly string $formType,
        public readonly string $employeeName,
        public readonly string $department,
        public readonly string $jobTitle,
        public readonly string $jobFamily,
        public readonly string $location,
        public readonly string $period,
        public readonly array $keyDeliverables,
        public readonly array $competencyRatings,
        public readonly array $comments,
        public readonly string $kdWeightsSum,
        public readonly string $employeeNumber = '',
        public readonly ?string $documentKdAverage = null,
        public readonly ?string $documentBcAverage = null,
        public readonly ?string $documentTotalScore = null,
    ) {
    }
}
