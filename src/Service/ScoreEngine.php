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
 */
final class ScoreEngine
{
    private const BC_SCALE = 10;
    private const KD_WEIGHT = '0.7';
    private const BC_WEIGHT = '0.3';

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
            $bcAvg = $this->calculateBcAverage($ratings);

            $appraisal->setKdAverageScore($kdAvg !== null ? $this->roundDecimal($kdAvg, 2) : null);
            $appraisal->setBcAverageScore($bcAvg !== null ? $this->roundDecimal($bcAvg, 2) : null);

            $allRated = $this->allManagerRatingsPresent($deliverables, $ratings);
            $hasKdData = $deliverables !== [];
            $hasBcData = $ratings !== [];

            if ($allRated && $hasKdData && $hasBcData && $kdAvg !== null && $bcAvg !== null) {
                $descriptorRows = $this->fetchDescriptorsForCycle($appraisal);
                $total = $this->calculateTotalScore($kdAvg, $bcAvg);
                $appraisal->setTotalScore($this->roundDecimal($total, 2));
                $appraisal->setKdDescriptor($this->resolveDescriptor($kdAvg, $descriptorRows, fn (ScoreDescriptor $d) => $d->getKdLabel()));
                $appraisal->setBcDescriptor($this->resolveDescriptor($bcAvg, $descriptorRows, fn (ScoreDescriptor $d) => $d->getCompetencyLabel()));
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
     * @param list<CompetencyRating> $ratings
     */
    private function calculateBcAverage(array $ratings): ?string
    {
        $rated = array_values(array_filter(array_map(static fn (CompetencyRating $cr) => $cr->getManagerRating(), $ratings)));
        if ($rated === []) {
            return null;
        }

        $sum = '0';
        foreach ($rated as $rating) {
            $sum = bcadd($sum, $rating, self::BC_SCALE);
        }

        return bcdiv($sum, (string) count($rated), self::BC_SCALE);
    }

    private function calculateTotalScore(string $kdAvg, string $bcAvg): string
    {
        return bcadd(bcmul($kdAvg, self::KD_WEIGHT, self::BC_SCALE), bcmul($bcAvg, self::BC_WEIGHT, self::BC_SCALE), self::BC_SCALE);
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
