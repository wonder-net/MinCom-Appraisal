<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\AppraisalCycle;
use App\Entity\GrowthPlan;
use App\Entity\TrainingNeed;
use App\Enum\TrainingNeedType;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<TrainingNeed>
 */
class TrainingNeedRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, TrainingNeed::class);
    }

    /**
     * @return list<TrainingNeed>
     */
    public function findByGrowthPlanOrdered(GrowthPlan $growthPlan): array
    {
        return $this->findBy(['growthPlan' => $growthPlan], ['sortOrder' => 'ASC']);
    }

    /**
     * Used by WorkflowGuardService's GROWTH_PLANNING -> PENDING_SIGNOFF
     * guard, which requires at least one TrainingNeed of any type.
     */
    public function existsByGrowthPlan(GrowthPlan $growthPlan): bool
    {
        return $this->count(['growthPlan' => $growthPlan]) > 0;
    }

    /**
     * Port of _fetch_training_need_rows: every TrainingNeed (any type)
     * whose growth plan belongs to an appraisal in the given cycle.
     *
     * @return list<TrainingNeed>
     */
    public function findByCycle(AppraisalCycle $cycle): array
    {
        return $this->createQueryBuilder('tn')
            ->innerJoin('tn.growthPlan', 'gp')
            ->innerJoin('gp.appraisal', 'a')
            ->where('a.cycle = :cycle')
            ->setParameter('cycle', $cycle)
            ->getQuery()
            ->getResult();
    }

    /**
     * Port of _fetch_recommended_course_rows: RECOMMENDED_COURSE-type
     * TrainingNeed rows for the given cycle.
     *
     * @return list<TrainingNeed>
     */
    public function findRecommendedCoursesByCycle(AppraisalCycle $cycle): array
    {
        return $this->createQueryBuilder('tn')
            ->innerJoin('tn.growthPlan', 'gp')
            ->innerJoin('gp.appraisal', 'a')
            ->where('a.cycle = :cycle')
            ->andWhere('tn.type = :type')
            ->setParameter('cycle', $cycle)
            ->setParameter('type', TrainingNeedType::RECOMMENDED_COURSE)
            ->getQuery()
            ->getResult();
    }
}
