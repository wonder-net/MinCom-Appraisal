<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\AppraisalCycle;
use App\Entity\BscPerspective;
use App\Entity\Competency;
use App\Entity\ScoreDescriptor;
use App\Repository\BscPerspectiveRepository;
use App\Repository\CompetencyRepository;
use App\Repository\ScoreDescriptorRepository;

/**
 * Port of apps.appraisals.views.build_config_snapshot: freezes reference
 * data at cycle-activation time for audit immutability. Deliberately
 * includes ALL competencies (active AND inactive) — Django's
 * `Competency.objects.values(...)` here has no is_active filter, unlike
 * create_appraisals_for_cycle's rating creation which filters to active
 * only (see AppraisalInstanceBuilder). Score descriptors are the system
 * defaults (null cycle) only.
 */
final class ConfigSnapshotBuilder
{
    public function __construct(
        private readonly CompetencyRepository $competencies,
        private readonly BscPerspectiveRepository $perspectives,
        private readonly ScoreDescriptorRepository $descriptors,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(AppraisalCycle $cycle): array
    {
        return [
            'competencies' => array_map(
                static fn (Competency $c) => [
                    'id' => (string) $c->getId(),
                    'name' => $c->getName(),
                    'applicable_to' => $c->getApplicableTo()->value,
                    'is_core' => $c->isCore(),
                    'sort_order' => $c->getSortOrder(),
                ],
                $this->competencies->findAllOrderedBySortOrder(includeInactive: true),
            ),
            'bsc_perspectives' => array_map(
                static fn (BscPerspective $p) => [
                    'id' => (string) $p->getId(),
                    'name' => $p->getName(),
                    'sort_order' => $p->getSortOrder(),
                ],
                $this->perspectives->findAllOrderedBySortOrder(),
            ),
            'score_descriptors' => array_map(
                static fn (ScoreDescriptor $d) => [
                    'id' => (string) $d->getId(),
                    'min_score' => $d->getMinScore(),
                    'max_score' => $d->getMaxScore(),
                    'kd_label' => $d->getKdLabel(),
                    'competency_label' => $d->getCompetencyLabel(),
                    'sort_order' => $d->getSortOrder(),
                ],
                $this->descriptors->findDefaultsOrderedBySortOrder(),
            ),
            'self_rating_enabled' => $cycle->isSelfRatingEnabled(),
        ];
    }
}
