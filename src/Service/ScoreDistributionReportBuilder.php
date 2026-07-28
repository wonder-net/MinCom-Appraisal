<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\AppraisalCycle;
use App\Entity\Department;
use App\Enum\AppraisalFormType;
use App\Repository\AppraisalRepository;
use App\Repository\ScoreDescriptorRepository;

/**
 * Port of apps.reports.views.ScoreDistributionReportView._build_payload.
 */
final class ScoreDistributionReportBuilder
{
    private const SCALE = 10;

    public function __construct(
        private readonly ScoreDescriptorRepository $descriptors,
        private readonly AppraisalRepository $appraisals,
        private readonly ReportCalculations $calculations,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(
        AppraisalCycle $cycle,
        ?Department $department,
        ?AppraisalFormType $formType,
        ?string $jobFamily,
    ): array {
        $descriptors = $this->descriptors->findForCycleOrderedBySortOrder($cycle);
        if ($descriptors === []) {
            $descriptors = $this->descriptors->findDefaultsOrderedBySortOrder();
        }

        $counts = $this->appraisals->countFinalisedByPerformanceDescriptor($cycle, $department, $formType, $jobFamily);
        $total = array_sum($counts);

        $bands = array_map(function ($descriptor) use ($counts, $total) {
            $count = $counts[$descriptor->getKdLabel()] ?? 0;

            return [
                'label' => $descriptor->getKdLabel(),
                'sort_order' => $descriptor->getSortOrder(),
                'count' => $count,
                'percentage' => $total > 0
                    ? $this->calculations->roundHalfEven(bcmul(bcdiv((string) $count, (string) $total, self::SCALE), '100', self::SCALE), 2)
                    : '0.00',
            ];
        }, $descriptors);

        return [
            'cycle_id' => (string) $cycle->getId(),
            'total' => $total,
            'bands' => $bands,
        ];
    }
}
