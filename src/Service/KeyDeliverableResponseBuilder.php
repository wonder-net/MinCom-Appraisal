<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\KeyDeliverable;
use App\Enum\AppraisalFormType;

/**
 * Port of apps.appraisals.serializers.KeyDeliverableSerializer.
 */
final class KeyDeliverableResponseBuilder
{
    public function __construct(private readonly PerspectiveKeyResolver $perspectiveKeys)
    {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(KeyDeliverable $kd): array
    {
        $perspective = $kd->getPerspective();
        $isManagerial = $kd->getAppraisal()->getFormType() === AppraisalFormType::FORM_A;

        return [
            'id' => (string) $kd->getId(),
            'appraisal' => (string) $kd->getAppraisal()->getId(),
            'perspective' => $this->perspectiveKeys->toKey($perspective),
            'perspective_name' => $perspective->getName(),
            'perspective_weight_cap' => $isManagerial ? $perspective->getWeightCapMgr() : $perspective->getWeightCap(),
            'perspective_max_kd_count' => $isManagerial ? $perspective->getMaxKdCountMgr() : $perspective->getMaxKdCount(),
            'description' => $kd->getDescription(),
            'weight' => $kd->getWeight(),
            'self_rating' => $kd->getSelfRating(),
            'manager_rating' => $kd->getManagerRating(),
            'weighted_score' => $kd->getWeightedScore(),
            'sort_order' => $kd->getSortOrder(),
            'created_at' => $kd->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'updated_at' => $kd->getUpdatedAt()->format(\DateTimeInterface::ATOM),
        ];
    }
}
