<?php

declare(strict_types=1);

namespace App\Service;

use App\Enum\AppraisalStatus;

/**
 * Port of apps.reports.services.{build_appraisals_by_status,
 * calculate_completion_rate} — pure helpers shared by every report
 * that breaks appraisals down by status (dashboard, department, and
 * later reports in this milestone).
 */
final class ReportCalculations
{
    private const SCALE = 10;

    private const EXCLUDED_FROM_COMPLETION = [
        AppraisalStatus::EXCLUDED,
        AppraisalStatus::INCOMPLETE,
    ];

    /**
     * Zero-fills every AppraisalStatus case so the response always
     * contains all 10 keys, even when the DB aggregation returned no
     * rows for a given status.
     *
     * @param array<string, int> $statusCounts
     * @return array<string, int>
     */
    public function zeroFilledStatusCounts(array $statusCounts): array
    {
        $result = [];
        foreach (AppraisalStatus::cases() as $status) {
            $result[$status->value] = $statusCounts[$status->value] ?? 0;
        }

        return $result;
    }

    /**
     * completion_rate = (FINALISED / eligible) * 100, where eligible
     * excludes EXCLUDED/INCOMPLETE. Returns "0.00" when eligible is 0.
     *
     * @param array<string, int> $appraisalsByStatus zero-filled (all 10 keys present)
     */
    public function completionRate(array $appraisalsByStatus): string
    {
        $finalisedCount = $appraisalsByStatus[AppraisalStatus::FINALISED->value] ?? 0;

        $eligibleCount = 0;
        foreach ($appraisalsByStatus as $statusValue => $count) {
            $status = AppraisalStatus::from($statusValue);
            if (!in_array($status, self::EXCLUDED_FROM_COMPLETION, true)) {
                $eligibleCount += $count;
            }
        }

        if ($eligibleCount === 0) {
            return '0.00';
        }

        $rate = bcmul(bcdiv((string) $finalisedCount, (string) $eligibleCount, self::SCALE), '100', self::SCALE);

        return $this->roundHalfUp($rate, 2);
    }

    /**
     * Round-half-up to $scale decimal places (bcmath's own scale
     * parameter truncates rather than rounds). Shared by every report
     * needing decimal quantization matching Django's
     * Decimal.quantize(..., rounding=ROUND_HALF_UP) — i.e. only
     * calculate_completion_rate, which passes that argument explicitly.
     */
    public function roundHalfUp(string $value, int $scale): string
    {
        $epsilon = '0.'.str_repeat('0', $scale).'5';

        return bcadd($value, $epsilon, $scale);
    }

    /**
     * Round-half-to-even to $scale decimal places. Every OTHER
     * `Decimal(...).quantize(Decimal("0.01"))` call in reports/views.py
     * (avg_total_score, score-distribution percentage, BSC
     * avg_weighted_score, competency-gap avg_manager_rating, KD/
     * competency variance) omits the `rounding=` argument, so it uses
     * Python's default decimal context — ROUND_HALF_EVEN ("banker's
     * rounding"), not ROUND_HALF_UP. Only calculate_completion_rate
     * passes ROUND_HALF_UP explicitly (see roundHalfUp() above); this
     * distinction is easy to miss porting one call at a time, so it's
     * spelled out here.
     *
     * Uses PHP's native round() (float-based, PHP_ROUND_HALF_EVEN) —
     * safe for this domain: every value here is a rating/percentage
     * average, far below float's ~15-17 significant-digit precision.
     */
    public function roundHalfEven(string $value, int $scale): string
    {
        $rounded = round((float) $value, $scale, \PHP_ROUND_HALF_EVEN);

        return number_format($rounded, $scale, '.', '');
    }
}
