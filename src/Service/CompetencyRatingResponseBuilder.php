<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\CompetencyRating;

/**
 * Port of apps.competencies.serializers.CompetencyRatingSerializer.
 */
final class CompetencyRatingResponseBuilder
{
    /**
     * @return array<string, mixed>
     */
    public function build(CompetencyRating $rating): array
    {
        $competency = $rating->getCompetency();

        return [
            'id' => (string) $rating->getId(),
            'appraisal' => (string) $rating->getAppraisal()->getId(),
            'competency' => (string) $competency->getId(),
            'competency_name' => $competency->getName(),
            'competency_applicable_to' => $competency->getApplicableTo()->value,
            'competency_is_core' => $competency->isCore(),
            'competency_sort_order' => $competency->getSortOrder(),
            // HR change request #8.2 — descriptive only, not separately
            // rated (see Competency's docblock).
            'sub_competencies' => $competency->getSubCompetencies(),
            'self_rating' => $rating->getSelfRating(),
            'manager_rating' => $rating->getManagerRating(),
            'created_at' => $rating->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'updated_at' => $rating->getUpdatedAt()->format(\DateTimeInterface::ATOM),
        ];
    }
}
