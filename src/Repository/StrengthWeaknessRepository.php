<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\GrowthPlan;
use App\Entity\StrengthWeakness;
use App\Enum\StrengthWeaknessType;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<StrengthWeakness>
 */
class StrengthWeaknessRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, StrengthWeakness::class);
    }

    /**
     * @return list<StrengthWeakness>
     */
    public function findByGrowthPlanOrdered(GrowthPlan $growthPlan): array
    {
        return $this->findBy(['growthPlan' => $growthPlan], ['sortOrder' => 'ASC']);
    }

    /**
     * Used by WorkflowGuardService's GROWTH_PLANNING -> PENDING_SIGNOFF
     * guard, which requires at least one STRENGTH and one WEAKNESS.
     */
    public function existsByGrowthPlanAndType(GrowthPlan $growthPlan, StrengthWeaknessType $type): bool
    {
        return $this->count(['growthPlan' => $growthPlan, 'type' => $type]) > 0;
    }
}
