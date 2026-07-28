<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\AppraisalCycle;
use App\Entity\CareerPlan;
use App\Entity\GrowthPlan;
use App\Enum\AppraisalStatus;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<CareerPlan>
 */
class CareerPlanRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, CareerPlan::class);
    }

    /**
     * Ordered by priority ascending — matches Django's Meta.ordering =
     * ["priority"], a plain string sort ("FIRST" < "SECOND" < "THIRD"
     * alphabetically happens to match priority order too).
     *
     * @return list<CareerPlan>
     */
    public function findByGrowthPlanOrdered(GrowthPlan $growthPlan): array
    {
        return $this->findBy(['growthPlan' => $growthPlan], ['priority' => 'ASC']);
    }

    /**
     * Port of CareerAspirationPipelineView._build_payload's queryset:
     * every CareerPlan whose growth plan belongs to a FINALISED
     * appraisal in the given cycle.
     *
     * @return list<CareerPlan>
     */
    public function findForFinalisedByCycle(AppraisalCycle $cycle): array
    {
        return $this->createQueryBuilder('cp')
            ->innerJoin('cp.growthPlan', 'gp')
            ->innerJoin('gp.appraisal', 'a')
            ->where('a.cycle = :cycle')
            ->andWhere('a.status = :status')
            ->setParameter('cycle', $cycle)
            ->setParameter('status', AppraisalStatus::FINALISED)
            ->getQuery()
            ->getResult();
    }
}
