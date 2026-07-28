<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Competency;
use App\Enum\CompetencyApplicableTo;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Competency>
 */
class CompetencyRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Competency::class);
    }

    /**
     * @return list<Competency>
     */
    public function findAllOrderedBySortOrder(bool $includeInactive): array
    {
        $criteria = $includeInactive ? [] : ['isActive' => true];

        return $this->findBy($criteria, ['sortOrder' => 'ASC']);
    }

    public function existsByNameCaseInsensitiveAndApplicableTo(string $name, CompetencyApplicableTo $applicableTo): bool
    {
        $count = $this->createQueryBuilder('c')
            ->select('COUNT(c.id)')
            ->where('LOWER(c.name) = LOWER(:name)')
            ->andWhere('c.applicableTo = :applicableTo')
            ->setParameter('name', $name)
            ->setParameter('applicableTo', $applicableTo)
            ->getQuery()
            ->getSingleScalarResult();

        return $count > 0;
    }

    public function findMaxSortOrder(): int
    {
        $max = $this->createQueryBuilder('c')
            ->select('MAX(c.sortOrder)')
            ->getQuery()
            ->getSingleScalarResult();

        return $max !== null ? (int) $max : 0;
    }
}
