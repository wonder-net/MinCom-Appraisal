<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Appraisal;
use App\Entity\GrowthPlan;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\DBAL\LockMode;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<GrowthPlan>
 */
class GrowthPlanRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, GrowthPlan::class);
    }

    public function findOneByAppraisal(Appraisal $appraisal): ?GrowthPlan
    {
        return $this->findOneBy(['appraisal' => $appraisal]);
    }

    /**
     * Port of `GrowthPlan.objects.select_for_update().filter(appraisal=...).first()`
     * — must be called inside a transaction. Only locks a row when one
     * already exists; a genuine create/create race beyond that relies
     * on the unique_growth_plan_per_appraisal DB constraint, matching
     * Django's own level of protection here.
     */
    public function findOneByAppraisalForUpdate(Appraisal $appraisal): ?GrowthPlan
    {
        return $this->createQueryBuilder('gp')
            ->where('gp.appraisal = :appraisal')
            ->setParameter('appraisal', $appraisal)
            ->getQuery()
            ->setLockMode(LockMode::PESSIMISTIC_WRITE)
            ->getOneOrNullResult();
    }

    /**
     * Batch lookup for NineBoxReportBuilder — avoids one query per
     * appraisal when building the grid for an entire cycle. Keyed by
     * appraisal ID string for O(1) lookup by the caller.
     *
     * @param list<Appraisal> $appraisals
     * @return array<string, GrowthPlan>
     */
    public function findByAppraisalsIndexed(array $appraisals): array
    {
        if ($appraisals === []) {
            return [];
        }

        $rows = $this->createQueryBuilder('gp')
            ->where('gp.appraisal IN (:appraisals)')
            ->setParameter('appraisals', $appraisals)
            ->getQuery()
            ->getResult();

        $indexed = [];
        foreach ($rows as $growthPlan) {
            \assert($growthPlan instanceof GrowthPlan);
            $indexed[(string) $growthPlan->getAppraisal()->getId()] = $growthPlan;
        }

        return $indexed;
    }
}
