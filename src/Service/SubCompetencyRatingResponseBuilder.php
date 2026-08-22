<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\SubCompetencyRating;

final class SubCompetencyRatingResponseBuilder
{
    /**
     * @return array<string, mixed>
     */
    public function build(SubCompetencyRating $rating): array
    {
        $subCompetency = $rating->getSubCompetency();

        return [
            'id' => (string) $rating->getId(),
            'competency_rating' => (string) $rating->getCompetencyRating()->getId(),
            'sub_competency' => $subCompetency !== null ? (string) $subCompetency->getId() : null,
            // True for an item the appraisee added themselves on this
            // one appraisal (SubCompetencyRatingCreateController) —
            // never touches HR's master SubCompetency list.
            'is_custom' => $rating->isCustom(),
            'name' => $rating->getName(),
            'sort_order' => $rating->getSortOrder(),
            'max_score' => $rating->getMaxScore(),
            'self_rating' => $rating->getSelfRating(),
            'manager_rating' => $rating->getManagerRating(),
            'created_at' => $rating->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'updated_at' => $rating->getUpdatedAt()->format(\DateTimeInterface::ATOM),
        ];
    }
}
