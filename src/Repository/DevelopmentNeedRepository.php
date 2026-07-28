<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\DevelopmentNeed;
use App\Entity\GrowthPlan;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<DevelopmentNeed>
 */
class DevelopmentNeedRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, DevelopmentNeed::class);
    }

    /**
     * Ordered by priority ascending — matches Django's Meta.ordering =
     * ["priority"].
     *
     * @return list<DevelopmentNeed>
     */
    public function findByGrowthPlanOrdered(GrowthPlan $growthPlan): array
    {
        return $this->findBy(['growthPlan' => $growthPlan], ['priority' => 'ASC']);
    }
}
