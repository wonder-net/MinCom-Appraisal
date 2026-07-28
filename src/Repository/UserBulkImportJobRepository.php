<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\User;
use App\Entity\UserBulkImportJob;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<UserBulkImportJob>
 */
class UserBulkImportJobRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, UserBulkImportJob::class);
    }

    /**
     * @return array{items: list<UserBulkImportJob>, count: int}
     */
    public function search(?User $createdBy, int $page, int $pageSize): array
    {
        $qb = $this->createQueryBuilder('j')->orderBy('j.createdAt', 'DESC');

        if ($createdBy !== null) {
            $qb->andWhere('j.createdBy = :createdBy')->setParameter('createdBy', $createdBy);
        }

        $countQb = (clone $qb)->select('COUNT(j.id)')->resetDQLPart('orderBy');
        $count = (int) $countQb->getQuery()->getSingleScalarResult();

        $items = $qb->setFirstResult(($page - 1) * $pageSize)
            ->setMaxResults($pageSize)
            ->getQuery()
            ->getResult();

        return ['items' => $items, 'count' => $count];
    }
}
