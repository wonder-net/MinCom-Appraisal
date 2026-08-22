<?php

declare(strict_types=1);

namespace App\Service;

/**
 * Splits a core competency's fixed 7.5-point ceiling evenly across
 * however many active sub-competencies it has, guaranteeing the shares
 * sum to EXACTLY 7.5 — the invariant HR asked for. A plain division
 * (e.g. 7.5 / 7 = 1.071428...) doesn't terminate at 2 decimal places,
 * so each share is truncated to 2dp and the leftover remainder (from
 * rounding every share down) is added onto the last share, rather than
 * silently losing a fraction of a point or letting the total drift.
 */
final class SubCompetencyWeightCalculator
{
    public const CORE_COMPETENCY_MAX_SCORE = '7.50';

    /**
     * @return list<string> decimal(4,2)-ready strings, length $count, summing to exactly CORE_COMPETENCY_MAX_SCORE
     */
    public function computeShares(int $count): array
    {
        if ($count <= 0) {
            return [];
        }

        $share = bcdiv(self::CORE_COMPETENCY_MAX_SCORE, (string) $count, 2);
        $shares = array_fill(0, $count, $share);

        $allocated = bcmul($share, (string) $count, 2);
        $remainder = bcsub(self::CORE_COMPETENCY_MAX_SCORE, $allocated, 2);
        if (bccomp($remainder, '0', 2) !== 0) {
            $shares[$count - 1] = bcadd($shares[$count - 1], $remainder, 2);
        }

        return $shares;
    }
}
