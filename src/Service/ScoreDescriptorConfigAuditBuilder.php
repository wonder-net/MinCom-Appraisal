<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\AppraisalCycle;
use App\Entity\ScoreDescriptor;
use App\Repository\ScoreDescriptorRepository;

/**
 * Port of apps.reports.views.{ScoreDescriptorConfigAuditView,
 * _extract_snapshot_bands, _build_live_bands}.
 */
final class ScoreDescriptorConfigAuditBuilder
{
    public function __construct(private readonly ScoreDescriptorRepository $descriptors)
    {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(AppraisalCycle $cycle): array
    {
        return [
            'cycle_id' => (string) $cycle->getId(),
            'cycle_name' => $cycle->getPeriodName(),
            'cycle_status' => $cycle->getStatus()->value,
            'config_snapshot_bands' => $this->extractSnapshotBands($cycle->getConfigSnapshot()),
            'live_bands' => array_map(fn (ScoreDescriptor $d) => [
                'sort_order' => $d->getSortOrder(),
                'min_score' => $d->getMinScore(),
                'max_score' => $d->getMaxScore(),
                'kd_label' => $d->getKdLabel(),
                'competency_label' => $d->getCompetencyLabel(),
            ], $this->descriptors->findForCycleOrderedBySortOrder($cycle)),
            'snapshot_taken_at' => $cycle->getUpdatedAt()->format(\DateTimeInterface::ATOM),
        ];
    }

    /**
     * @param array<string, mixed> $configSnapshot
     * @return list<array{sort_order: int, min_score: string, max_score: string, kd_label: string, competency_label: string}>
     */
    private function extractSnapshotBands(array $configSnapshot): array
    {
        $rawBands = $configSnapshot['score_descriptors'] ?? null;
        if (!is_array($rawBands)) {
            return [];
        }

        return array_map(static fn (array $band) => [
            'sort_order' => $band['sort_order'] ?? 0,
            'min_score' => $band['min_score'] ?? '0.00',
            'max_score' => $band['max_score'] ?? '0.00',
            'kd_label' => $band['kd_label'] ?? '',
            'competency_label' => $band['competency_label'] ?? '',
        ], $rawBands);
    }
}
