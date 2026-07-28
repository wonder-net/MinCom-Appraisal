<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\AppraisalCycle;
use App\Entity\ScoreDescriptor;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<ScoreDescriptor>
 */
class ScoreDescriptorRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, ScoreDescriptor::class);
    }

    /**
     * System-default descriptors (null cycle), ordered by sort_order.
     *
     * @return list<ScoreDescriptor>
     */
    public function findDefaultsOrderedBySortOrder(): array
    {
        return $this->createQueryBuilder('d')
            ->where('d.cycle IS NULL')
            ->orderBy('d.sortOrder', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * @return list<ScoreDescriptor>
     */
    public function findForCycleOrderedBySortOrder(AppraisalCycle $cycle): array
    {
        return $this->findBy(['cycle' => $cycle], ['sortOrder' => 'ASC']);
    }
}
