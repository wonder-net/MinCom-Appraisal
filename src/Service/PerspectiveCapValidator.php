<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Appraisal;
use App\Entity\BscPerspective;
use App\Entity\KeyDeliverable;
use App\Enum\AppraisalFormType;
use App\Repository\KeyDeliverableRepository;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.appraisals.views._validate_perspective_caps. Selects caps
 * based on form_type: Form A (managerial) uses weight_cap_mgr/
 * max_kd_count_mgr, Form B uses weight_cap/max_kd_count. When a
 * perspective has no per-perspective weight cap (Form A), the total KD
 * weight across ALL perspectives must not exceed 100%.
 *
 * Decimal arithmetic uses bcmath at a generous internal scale (10) and
 * relies on Postgres to round to each column's defined scale on
 * persistence — the same behaviour Django gets implicitly (it never
 * quantizes a Decimal itself; the DB does on save).
 */
final class PerspectiveCapValidator
{
    private const BC_SCALE = 10;

    public function __construct(private readonly KeyDeliverableRepository $deliverables)
    {
    }

    public function validate(
        Appraisal $appraisal,
        BscPerspective $perspective,
        string $newWeight,
        ?Uuid $excludeKdId,
        bool $isNew,
    ): ?string {
        $isMgr = $appraisal->getFormType() === AppraisalFormType::FORM_A;
        $weightCap = $isMgr ? $perspective->getWeightCapMgr() : $perspective->getWeightCap();
        $maxCount = $isMgr ? $perspective->getMaxKdCountMgr() : $perspective->getMaxKdCount();

        $existing = $this->deliverables->findByAppraisalAndPerspective($appraisal, $perspective, $excludeKdId);

        if ($weightCap !== null) {
            $currentTotal = $this->sumWeights($existing);
            if (bccomp(bcadd($currentTotal, $newWeight, self::BC_SCALE), $weightCap, self::BC_SCALE) > 0) {
                return sprintf('Weight cap exceeded for %s. Maximum allowed: %s.', $perspective->getName(), $weightCap);
            }
        }

        if ($weightCap === null) {
            $allKds = $this->deliverables->findByAppraisal($appraisal, $excludeKdId);
            $totalWeight = $this->sumWeights($allKds);
            $attemptedTotal = bcadd($totalWeight, $newWeight, self::BC_SCALE);
            if (bccomp($attemptedTotal, '1.0', self::BC_SCALE) > 0) {
                return sprintf(
                    'Total KD weight across all perspectives cannot exceed 100%%. Current total: %s%%, attempted to add: %s%%.',
                    sprintf('%.1f', ((float) $totalWeight) * 100),
                    sprintf('%.1f', ((float) $newWeight) * 100),
                );
            }
        }

        if ($maxCount !== null && $isNew && count($existing) >= $maxCount) {
            return sprintf('Maximum of %d key deliverables allowed for %s.', $maxCount, $perspective->getName());
        }

        return null;
    }

    /**
     * @param list<KeyDeliverable> $deliverables
     */
    private function sumWeights(array $deliverables): string
    {
        $total = '0';
        foreach ($deliverables as $kd) {
            $total = bcadd($total, $kd->getWeight(), self::BC_SCALE);
        }

        return $total;
    }
}
