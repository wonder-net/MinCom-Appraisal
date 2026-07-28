<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\AppraisalCycle;
use App\Enum\AppraisalCycleStatus;

/**
 * Port of apps.appraisals.serializers.AppraisalCycleSerializer.
 */
final class AppraisalCycleResponseBuilder
{
    /**
     * @return array<string, mixed>
     */
    public function build(AppraisalCycle $cycle): array
    {
        return [
            'id' => (string) $cycle->getId(),
            'period_name' => $cycle->getPeriodName(),
            'start_date' => $cycle->getStartDate()->format('Y-m-d'),
            'end_date' => $cycle->getEndDate()->format('Y-m-d'),
            'status' => $cycle->getStatus()->value,
            'self_rating_enabled' => $cycle->isSelfRatingEnabled(),
            'is_active' => $cycle->getStatus() === AppraisalCycleStatus::ACTIVE,
            'created_by' => (string) $cycle->getCreatedBy()->getId(),
            'config_snapshot' => $cycle->getConfigSnapshot(),
            'created_at' => $cycle->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'updated_at' => $cycle->getUpdatedAt()->format(\DateTimeInterface::ATOM),
        ];
    }
}
