<?php

declare(strict_types=1);

namespace App\Tests\Unit\AppraisalImport;

use App\AppraisalImport\ScoreValidationService;
use PHPUnit\Framework\TestCase;

final class ScoreValidationServiceTest extends TestCase
{
    public function testNoDiscrepancyWhenWithinTolerance(): void
    {
        $service = new ScoreValidationService();
        $result = $service->validate(
            kdWeights: ['0.5', '0.5'],
            kdManagerRatings: ['4', '3'],
            competencyRatings: ['4', '2'],
            documentKdAvg: '3.5',
            documentBcAvg: '3.0',
            documentTotal: '3.35',
        );

        self::assertSame('3.5', $result->calculatedKdAvg);
        self::assertSame('3', $result->calculatedBcAvg);
        self::assertFalse($result->hasDiscrepancy);
        self::assertSame([], $result->discrepancyDetails);
    }

    public function testDiscrepancyDetectedOutsideTolerance(): void
    {
        $service = new ScoreValidationService();
        $result = $service->validate(
            kdWeights: ['1.0'],
            kdManagerRatings: ['4'],
            competencyRatings: ['4'],
            documentKdAvg: '3.0',
            documentBcAvg: null,
            documentTotal: null,
        );

        self::assertTrue($result->hasDiscrepancy);
        self::assertCount(1, $result->discrepancyDetails);
        self::assertStringContainsString('KD average', $result->discrepancyDetails[0]);
    }

    public function testNullWhenNoRatingsPresent(): void
    {
        $service = new ScoreValidationService();
        $result = $service->validate(
            kdWeights: ['0.5'],
            kdManagerRatings: [null],
            competencyRatings: [null],
            documentKdAvg: null,
            documentBcAvg: null,
            documentTotal: null,
        );

        self::assertNull($result->calculatedKdAvg);
        self::assertNull($result->calculatedBcAvg);
        self::assertNull($result->calculatedTotal);
        self::assertFalse($result->hasDiscrepancy);
    }

    public function testMismatchedWeightsAndRatingsCountsReturnsNullAverage(): void
    {
        $service = new ScoreValidationService();
        $result = $service->validate(
            kdWeights: ['0.5', '0.5'],
            kdManagerRatings: ['4'],
            competencyRatings: [],
            documentKdAvg: null,
            documentBcAvg: null,
            documentTotal: null,
        );

        self::assertNull($result->calculatedKdAvg);
    }

    public function testTotalScoreUsesWeightedKdAndBc(): void
    {
        $service = new ScoreValidationService();
        $result = $service->validate(
            kdWeights: ['1.0'],
            kdManagerRatings: ['4'],
            competencyRatings: ['5'],
            documentKdAvg: null,
            documentBcAvg: null,
            documentTotal: null,
        );

        // 4 * 0.7 + 5 * 0.3 = 2.8 + 1.5 = 4.3
        self::assertSame('4', $result->calculatedKdAvg);
        self::assertSame('5', $result->calculatedBcAvg);
        self::assertSame(0, bccomp('4.3', $result->calculatedTotal, 2));
    }
}
