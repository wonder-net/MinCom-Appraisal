<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\CompetencyRating;
use App\Repository\SubCompetencyRatingRepository;

/**
 * Port of apps.competencies.serializers.CompetencyRatingSerializer.
 */
final class CompetencyRatingResponseBuilder
{
    public function __construct(
        private readonly SubCompetencyRatingRepository $subCompetencyRatings,
        private readonly SubCompetencyRatingResponseBuilder $subCompetencyRatingResponseBuilder,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(CompetencyRating $rating): array
    {
        $competency = $rating->getCompetency();

        // Present (non-empty) exactly when this core value's rating is
        // taken via its sub-competencies rather than directly — see
        // CompetencyRatingUpdateController, which rejects a direct
        // PATCH whenever this list is non-empty.
        $subRatings = $this->subCompetencyRatings->findByCompetencyRatingOrdered($rating);

        return [
            'id' => (string) $rating->getId(),
            'appraisal' => (string) $rating->getAppraisal()->getId(),
            'competency' => (string) $competency->getId(),
            'competency_name' => $competency->getName(),
            'competency_applicable_to' => $competency->getApplicableTo()->value,
            'competency_is_core' => $competency->isCore(),
            'competency_sort_order' => $competency->getSortOrder(),
            'sub_competency_ratings' => array_map(
                fn ($scr) => $this->subCompetencyRatingResponseBuilder->build($scr),
                $subRatings,
            ),
            'self_rating' => $rating->getSelfRating(),
            'manager_rating' => $rating->getManagerRating(),
            'created_at' => $rating->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'updated_at' => $rating->getUpdatedAt()->format(\DateTimeInterface::ATOM),
        ];
    }
}
