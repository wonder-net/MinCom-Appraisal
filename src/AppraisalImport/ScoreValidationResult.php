<?php

declare(strict_types=1);

namespace App\AppraisalImport;

/**
 * Port of score_validation.ScoreValidationResult.
 */
final class ScoreValidationResult
{
    /**
     * @param list<string> $discrepancyDetails
     */
    public function __construct(
        public readonly ?string $calculatedKdAvg,
        public readonly ?string $calculatedBcAvg,
        public readonly ?string $calculatedTotal,
        public readonly ?string $documentKdAvg,
        public readonly ?string $documentBcAvg,
        public readonly ?string $documentTotal,
        public readonly bool $hasDiscrepancy,
        public readonly array $discrepancyDetails = [],
    ) {
    }
}
