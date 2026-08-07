<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Appraisal;
use App\Entity\CompetencyRating;
use App\Entity\KeyDeliverable;
use App\Entity\ScoreDescriptor;
use App\Repository\CompetencyRatingRepository;
use App\Repository\KeyDeliverableRepository;
use App\Repository\ScoreDescriptorRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Port of apps.appraisals.services.{calculate_weighted_score,
 * calculate_kd_average, calculate_bc_average, calculate_total_score,
 * resolve_descriptor, check_all_manager_ratings_present, compute_scores}.
 *
 * Idempotent: calling it twice on an unchanged appraisal produces the
 * same result. Descriptor lookup caching (Django's "descriptors:cycle:*"
 * / "descriptors:defaults" keys) is deliberately not replicated — it's
 * a pure performance optimisation with no observable effect on the
 * response, and skipping it avoids yet another cache-test-isolation
 * surface (see CompetencyCache/CycleListCache's test-isolation fixes).
 *
 * Audit logging (audit_log_action("score.compute", ...) in Django) is
 * intentionally omitted — the `audit` app isn't ported yet.
 *
 * HR change requests #8/#9 rescaled the total score to a 0-100 points
 * system (Key Performance Indicators up to 70 points + Mincom Core
 * Values up to 30 points):
 *  - Key Deliverables (KPIs) are unchanged at the data-entry level —
 *    still rated 1.0-5.0 with per-perspective weights summing to 1.0 —
 *    so `kdAverageScore` stays a 0-5 weighted average as before, but now
 *    contributes `kdAvg / KD_MAX_RATING * KD_POINTS_MAX` (max 70) to the total.
 *  - Mincom Core Values (formerly "Behavioural Competencies") are rated
 *    directly in points, 1.0-7.5 in 0.5 steps (see
 *    CompetencyRatingUpdateController's validation), one rating per core
 *    value (currently 4: Teamwork/Integrity/Professionalism/Service
 *    Excellence). `bcAverageScore` is now their SUM (not a mean), max 30.
 *  - Total score = kdPoints (0-70) + bcPoints (0-30), range 0-100 — the
 *    scale the new score_descriptor bands (Outstanding 80+ / Good 70-79
 *    / Moderate 60-69 / Average 50-59 / Under <50) are seeded against.
 *  - Per-component descriptors (kd_descriptor/bc_descriptor) resolve
 *    against that SAME 0-100 band table by first normalising each
 *    component to percent-of-its-own-max (kdAvg/5*100, bcPoints/30*100)
 *    — otherwise a 0-5 KD average could never land in an "Outstanding"
 *    band under the new 0-100 bands.
 */
final class ScoreEngine
{
    private const BC_SCALE = 10;

    /** Max possible Key Deliverable rating (unchanged data-entry scale). */
    private const KD_MAX_RATING = '5';

    /** Points a fully-rated KD side (kdAvg = KD_MAX_RATING) contributes to the 100-point total. */
    private const KD_POINTS_MAX = '70';

    /** Points a fully-rated Mincom Core Values side (4 x 7.5) contributes to the 100-point total. */
    private const BC_POINTS_MAX = '30';

    public function __construct(
        private readonly KeyDeliverableRepository $keyDeliverables,
        private readonly CompetencyRatingRepository $competencyRatings,
        private readonly ScoreDescriptorRepository $descriptors,
        private readonly EntityManagerInterface $em,
    ) {
    }

    public function computeScores(Appraisal $appraisal): void
    {
        $this->em->wrapInTransaction(function () use ($appraisal): void {
            $deliverables = $this->keyDeliverables->findByAppraisalOrdered($appraisal);
            foreach ($deliverables as $kd) {
                $kd->setWeightedScore($kd->getManagerRating() !== null
                    ? $this->roundDecimal(bcmul($kd->getWeight(), $kd->getManagerRating(), self::BC_SCALE), 4)
                    : null);
            }

            $ratings = $this->competencyRatings->findByAppraisalOrdered($appraisal);

            // Kept at full internal precision (scale 10) for descriptor
            // range resolution below — mirrors Django, which resolves
            // descriptors against the exact in-memory Decimal *before*
            // the DB rounds the column on save. Only the persisted
            // entity fields are rounded to their column scale.
            $kdAvg = $this->calculateKdAverage($deliverables);
            $bcPoints = $this->calculateBcPoints($ratings);

            $appraisal->setKdAverageScore($kdAvg !== null ? $this->roundDecimal($kdAvg, 2) : null);
            $appraisal->setBcAverageScore($bcPoints !== null ? $this->roundDecimal($bcPoints, 2) : null);

            $allRated = $this->allManagerRatingsPresent($deliverables, $ratings);
            $hasKdData = $deliverables !== [];
            $hasBcData = $ratings !== [];

            if ($allRated && $hasKdData && $hasBcData && $kdAvg !== null && $bcPoints !== null) {
                $descriptorRows = $this->fetchDescriptorsForCycle($appraisal);
                $total = $this->calculateTotalScore($kdAvg, $bcPoints);
                $kdPercent = bcmul(bcdiv($kdAvg, self::KD_MAX_RATING, self::BC_SCALE), '100', self::BC_SCALE);
                $bcPercent = bcmul(bcdiv($bcPoints, self::BC_POINTS_MAX, self::BC_SCALE), '100', self::BC_SCALE);
                $appraisal->setTotalScore($this->roundDecimal($total, 2));
                $appraisal->setKdDescriptor($this->resolveDescriptor($kdPercent, $descriptorRows, fn (ScoreDescriptor $d) => $d->getKdLabel()));
                $appraisal->setBcDescriptor($this->resolveDescriptor($bcPercent, $descriptorRows, fn (ScoreDescriptor $d) => $d->getCompetencyLabel()));
                $appraisal->setPerformanceDescriptor($this->resolveDescriptor($total, $descriptorRows, fn (ScoreDescriptor $d) => $d->getKdLabel()));
            } else {
                $appraisal->setTotalScore(null);
                $appraisal->setKdDescriptor(null);
                $appraisal->setBcDescriptor(null);
                $appraisal->setPerformanceDescriptor(null);
            }

            $this->em->flush();
        });
    }

    /**
     * Round-half-up to $scale decimal places. bcmath's own scale
     * parameter truncates rather than rounds, so this adds half a
     * unit-in-the-last-place before truncating. Safe for this domain
     * only because every value here (weights, ratings, scores) is
     * non-negative.
     */
    private function roundDecimal(string $value, int $scale): string
    {
        $epsilon = '0.'.str_repeat('0', $scale).'5';

        return bcadd($value, $epsilon, $scale);
    }

    /**
     * @param list<KeyDeliverable> $deliverables
     */
    private function calculateKdAverage(array $deliverables): ?string
    {
        $rated = array_filter($deliverables, static fn (KeyDeliverable $kd) => $kd->getManagerRating() !== null);
        if ($rated === []) {
            return null;
        }

        $sum = '0';
        foreach ($rated as $kd) {
            $sum = bcadd($sum, bcmul($kd->getWeight(), $kd->getManagerRating(), self::BC_SCALE), self::BC_SCALE);
        }

        return $sum;
    }

    /**
     * Mincom Core Values are rated directly in points (1.0-7.5 each, HR
     * change request #8), so this is a SUM of the rated values — max 30
     * across the 4 core values — not a mean like the old "Behavioural
     * Competency Average."
     *
     * @param list<CompetencyRating> $ratings
     */
    private function calculateBcPoints(array $ratings): ?string
    {
        $rated = array_values(array_filter(array_map(static fn (CompetencyRating $cr) => $cr->getManagerRating(), $ratings)));
        if ($rated === []) {
            return null;
        }

        $sum = '0';
        foreach ($rated as $rating) {
            $sum = bcadd($sum, $rating, self::BC_SCALE);
        }

        return $sum;
    }

    /**
     * kdAvg (0-5) is rescaled to a 0-70 point contribution; bcPoints
     * (0-30, already direct points — see calculateBcPoints()) is added
     * as-is. Range 0-100 overall.
     */
    private function calculateTotalScore(string $kdAvg, string $bcPoints): string
    {
        $kdPoints = bcmul(bcdiv($kdAvg, self::KD_MAX_RATING, self::BC_SCALE), self::KD_POINTS_MAX, self::BC_SCALE);

        return bcadd($kdPoints, $bcPoints, self::BC_SCALE);
    }

    /**
     * @param list<KeyDeliverable> $deliverables
     * @param list<CompetencyRating> $ratings
     */
    private function allManagerRatingsPresent(array $deliverables, array $ratings): bool
    {
        foreach ($deliverables as $kd) {
            if ($kd->getManagerRating() === null) {
                return false;
            }
        }
        foreach ($ratings as $cr) {
            if ($cr->getManagerRating() === null) {
                return false;
            }
        }

        return true;
    }

    /**
     * Cycle-specific descriptors first (ordered by sort_order); falls
     * back to system defaults (null cycle) when the cycle has none.
     *
     * @return list<ScoreDescriptor>
     */
    private function fetchDescriptorsForCycle(Appraisal $appraisal): array
    {
        $cycleDescriptors = $this->descriptors->findForCycleOrderedBySortOrder($appraisal->getCycle());

        return $cycleDescriptors !== [] ? $cycleDescriptors : $this->descriptors->findDefaultsOrderedBySortOrder();
    }

    /**
     * @param list<ScoreDescriptor> $descriptors
     * @param callable(ScoreDescriptor): string $labelSelector
     */
    private function resolveDescriptor(string $score, array $descriptors, callable $labelSelector): string
    {
        foreach ($descriptors as $descriptor) {
            if (bccomp($descriptor->getMinScore(), $score, 2) <= 0 && bccomp($score, $descriptor->getMaxScore(), 2) <= 0) {
                return $labelSelector($descriptor);
            }
        }

        return '';
    }
}
