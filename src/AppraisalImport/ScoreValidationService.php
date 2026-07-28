<?php

declare(strict_types=1);

namespace App\AppraisalImport;

/**
 * Port of score_validation.validate_scores. Pure function — calculates
 * scores from imported ratings and compares with document totals
 * extracted from the spreadsheet. Formula mirrors ScoreEngine's
 * calculateKdAverage/calculateBcAverage (same KD_WEIGHT/BC_WEIGHT
 * constants) but operates on raw parsed values rather than entities,
 * since this runs during preview before any Appraisal/KeyDeliverable
 * rows exist.
 */
final class ScoreValidationService
{
    private const DISCREPANCY_TOLERANCE = '0.01';
    private const KD_WEIGHT = '0.7';
    private const BC_WEIGHT = '0.3';
    private const SCALE = 10;

    /**
     * @param list<string> $kdWeights
     * @param list<string|null> $kdManagerRatings
     * @param list<string|null> $competencyRatings
     */
    public function validate(
        array $kdWeights,
        array $kdManagerRatings,
        array $competencyRatings,
        ?string $documentKdAvg,
        ?string $documentBcAvg,
        ?string $documentTotal,
    ): ScoreValidationResult {
        $calculatedKdAvg = $this->calculateKdAverage($kdWeights, $kdManagerRatings);
        $calculatedBcAvg = $this->calculateBcAverage($competencyRatings);

        $calculatedTotal = null;
        if ($calculatedKdAvg !== null && $calculatedBcAvg !== null) {
            $calculatedTotal = bcadd(
                bcmul($calculatedKdAvg, self::KD_WEIGHT, self::SCALE),
                bcmul($calculatedBcAvg, self::BC_WEIGHT, self::SCALE),
                self::SCALE,
            );
        }

        $details = [];

        if ($calculatedKdAvg !== null && $documentKdAvg !== null) {
            $diff = $this->absDiff($calculatedKdAvg, $documentKdAvg);
            if (bccomp($diff, self::DISCREPANCY_TOLERANCE, self::SCALE) > 0) {
                $details[] = sprintf('KD average: document %s, calculated %s (diff %s)', $documentKdAvg, $this->trimTrailingZeros($calculatedKdAvg), $this->trimTrailingZeros($diff));
            }
        }

        if ($calculatedBcAvg !== null && $documentBcAvg !== null) {
            $diff = $this->absDiff($calculatedBcAvg, $documentBcAvg);
            if (bccomp($diff, self::DISCREPANCY_TOLERANCE, self::SCALE) > 0) {
                $details[] = sprintf('BC average: document %s, calculated %s (diff %s)', $documentBcAvg, $this->trimTrailingZeros($calculatedBcAvg), $this->trimTrailingZeros($diff));
            }
        }

        if ($calculatedTotal !== null && $documentTotal !== null) {
            $diff = $this->absDiff($calculatedTotal, $documentTotal);
            if (bccomp($diff, self::DISCREPANCY_TOLERANCE, self::SCALE) > 0) {
                $details[] = sprintf('Total score: document %s, calculated %s (diff %s)', $documentTotal, $this->trimTrailingZeros($calculatedTotal), $this->trimTrailingZeros($diff));
            }
        }

        return new ScoreValidationResult(
            calculatedKdAvg: $calculatedKdAvg !== null ? $this->trimTrailingZeros($calculatedKdAvg) : null,
            calculatedBcAvg: $calculatedBcAvg !== null ? $this->trimTrailingZeros($calculatedBcAvg) : null,
            calculatedTotal: $calculatedTotal !== null ? $this->trimTrailingZeros($calculatedTotal) : null,
            documentKdAvg: $documentKdAvg,
            documentBcAvg: $documentBcAvg,
            documentTotal: $documentTotal,
            hasDiscrepancy: $details !== [],
            discrepancyDetails: $details,
        );
    }

    /**
     * Trims trailing zeros from a bcmath fixed-scale result (e.g.
     * "3.5000000000" -> "3.5"), matching Python Decimal's natural
     * (precision-preserving, not padding) arithmetic.
     */
    private function trimTrailingZeros(string $decimal): string
    {
        if (!str_contains($decimal, '.')) {
            return $decimal;
        }

        $trimmed = rtrim(rtrim($decimal, '0'), '.');

        return $trimmed === '' || $trimmed === '-' ? '0' : $trimmed;
    }

    /**
     * @param list<string> $weights
     * @param list<string|null> $ratings
     */
    private function calculateKdAverage(array $weights, array $ratings): ?string
    {
        if (count($weights) !== count($ratings)) {
            return null;
        }

        $total = '0';
        $hasAny = false;
        foreach ($weights as $i => $weight) {
            $rating = $ratings[$i];
            if ($rating !== null) {
                $total = bcadd($total, bcmul($weight, $rating, self::SCALE), self::SCALE);
                $hasAny = true;
            }
        }

        return $hasAny ? $total : null;
    }

    /**
     * @param list<string|null> $ratings
     */
    private function calculateBcAverage(array $ratings): ?string
    {
        $rated = array_values(array_filter($ratings, static fn (?string $r) => $r !== null));
        if ($rated === []) {
            return null;
        }

        $sum = '0';
        foreach ($rated as $rating) {
            $sum = bcadd($sum, $rating, self::SCALE);
        }

        return bcdiv($sum, (string) count($rated), self::SCALE);
    }

    private function absDiff(string $a, string $b): string
    {
        $diff = bcsub($a, $b, self::SCALE);

        return bccomp($diff, '0', self::SCALE) < 0 ? bcmul($diff, '-1', self::SCALE) : $diff;
    }
}
