<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Appraisal;
use App\Entity\Comment;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Comment>
 */
class CommentRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Comment::class);
    }

    /**
     * Matches CommentViewSet.get_queryset()'s ordering: created_at ASC.
     *
     * @return list<Comment>
     */
    public function findByAppraisalOrdered(Appraisal $appraisal): array
    {
        return $this->findBy(['appraisal' => $appraisal], ['createdAt' => 'ASC']);
    }

    /**
     * @return array{items: list<Comment>, count: int}
     */
    public function findByAppraisalPaginated(Appraisal $appraisal, int $page, int $pageSize): array
    {
        $qb = $this->createQueryBuilder('c')
            ->where('c.appraisal = :appraisal')
            ->setParameter('appraisal', $appraisal)
            ->orderBy('c.createdAt', 'ASC');

        $countQb = (clone $qb)->select('COUNT(c.id)')->resetDQLPart('orderBy');
        $count = (int) $countQb->getQuery()->getSingleScalarResult();

        $items = $qb->setFirstResult(($page - 1) * $pageSize)
            ->setMaxResults($pageSize)
            ->getQuery()
            ->getResult();

        return ['items' => $items, 'count' => $count];
    }
}
