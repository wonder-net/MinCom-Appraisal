<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Competency;

/**
 * Port of apps.competencies.serializers.AdminCompetencyReadSerializer. The
 * `category` field is a read-only alias of `applicable_to`, kept for
 * backwards compatibility per Django's docblock.
 */
final class CompetencyResponseBuilder
{
    /**
     * @return array{id: string, name: string, category: string, applicable_to: string, is_core: bool, sort_order: int, is_active: bool}
     */
    public function build(Competency $competency): array
    {
        return [
            'id' => (string) $competency->getId(),
            'name' => $competency->getName(),
            'category' => $competency->getApplicableTo()->value,
            'applicable_to' => $competency->getApplicableTo()->value,
            'is_core' => $competency->isCore(),
            'sort_order' => $competency->getSortOrder(),
            'is_active' => $competency->isActive(),
        ];
    }
}
