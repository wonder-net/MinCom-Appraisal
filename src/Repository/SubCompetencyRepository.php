<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Competency;
use App\Entity\SubCompetency;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<SubCompetency>
 */
class SubCompetencyRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, SubCompetency::class);
    }

    /**
     * @return list<SubCompetency>
     */
    public function findByCompetencyOrdered(Competency $competency, bool $includeInactive = false): array
    {
        $criteria = ['competency' => $competency];
        if (!$includeInactive) {
            $criteria['isActive'] = true;
        }

        return $this->findBy($criteria, ['sortOrder' => 'ASC']);
    }

    public function findMaxSortOrder(Competency $competency): int
    {
        $max = $this->createQueryBuilder('sc')
            ->select('MAX(sc.sortOrder)')
            ->where('sc.competency = :competency')
            ->setParameter('competency', $competency)
            ->getQuery()
            ->getSingleScalarResult();

        return $max !== null ? (int) $max : 0;
    }
}
