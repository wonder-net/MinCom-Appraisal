<?php

declare(strict_types=1);

namespace App\Tests\Unit\Service;

use App\Service\SubCompetencyWeightCalculator;
use PHPUnit\Framework\TestCase;

final class SubCompetencyWeightCalculatorTest extends TestCase
{
    public function testZeroCountReturnsEmptyList(): void
    {
        self::assertSame([], (new SubCompetencyWeightCalculator())->computeShares(0));
    }

    public function testEvenlyDividingCountSplitsEqually(): void
    {
        self::assertSame(['2.50', '2.50', '2.50'], (new SubCompetencyWeightCalculator())->computeShares(3));
    }

    public function testSingleSubCompetencyGetsTheWholeShare(): void
    {
        self::assertSame(['7.50'], (new SubCompetencyWeightCalculator())->computeShares(1));
    }

    /**
     * 7.5/7 = 1.0714285... doesn't terminate at 2dp — every share is
     * truncated down and the leftover remainder lands entirely on the
     * last share, so the sum still comes out to exactly 7.50.
     */
    public function testNonDividingCountStillSumsToExactTotal(): void
    {
        $shares = (new SubCompetencyWeightCalculator())->computeShares(7);

        self::assertCount(7, $shares);
        self::assertSame(['1.07', '1.07', '1.07', '1.07', '1.07', '1.07', '1.08'], $shares);
        self::assertSame('7.50', array_reduce($shares, static fn (string $sum, string $share) => bcadd($sum, $share, 2), '0'));
    }

    /**
     * @dataProvider countProvider
     */
    public function testSharesAlwaysSumToExactly750(int $count): void
    {
        $shares = (new SubCompetencyWeightCalculator())->computeShares($count);

        $sum = array_reduce($shares, static fn (string $sum, string $share) => bcadd($sum, $share, 2), '0');
        self::assertSame('7.50', $sum);
    }

    /**
     * @return iterable<string, array{0: int}>
     */
    public static function countProvider(): iterable
    {
        yield '2' => [2];
        yield '3' => [3];
        yield '4' => [4];
        yield '5' => [5];
        yield '6' => [6];
        yield '7' => [7];
        yield '9' => [9];
        yield '11' => [11];
    }
}
