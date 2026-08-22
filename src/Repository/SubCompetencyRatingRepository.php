<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\CompetencyRating;
use App\Entity\SubCompetencyRating;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

/**
 * @extends ServiceEntityRepository<SubCompetencyRating>
 */
class SubCompetencyRatingRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, SubCompetencyRating::class);
    }

    /**
     * Ordered by the rating row's OWN sortOrder — not the master
     * SubCompetency's — since a custom, appraisee-added item
     * (subCompetency null) has no master row to join to.
     *
     * @return list<SubCompetencyRating>
     */
    public function findByCompetencyRatingOrdered(CompetencyRating $competencyRating): array
    {
        return $this->createQueryBuilder('scr')
            ->leftJoin('scr.subCompetency', 'sc')->addSelect('sc')
            ->where('scr.competencyRating = :competencyRating')
            ->setParameter('competencyRating', $competencyRating)
            ->orderBy('scr.sortOrder', 'ASC')
            ->getQuery()
            ->getResult();
    }

    public function findOneByCompetencyRatingAndId(CompetencyRating $competencyRating, string $id): ?SubCompetencyRating
    {
        if (!Uuid::isValid($id)) {
            return null;
        }

        return $this->findOneBy(['competencyRating' => $competencyRating, 'id' => Uuid::fromString($id)]);
    }

    public function countByCompetencyRating(CompetencyRating $competencyRating): int
    {
        return (int) $this->createQueryBuilder('scr')
            ->select('COUNT(scr.id)')
            ->where('scr.competencyRating = :competencyRating')
            ->setParameter('competencyRating', $competencyRating)
            ->getQuery()
            ->getSingleScalarResult();
    }

    public function existsByCompetencyRatingAndNameCaseInsensitive(CompetencyRating $competencyRating, string $name): bool
    {
        $count = $this->createQueryBuilder('scr')
            ->select('COUNT(scr.id)')
            ->where('scr.competencyRating = :competencyRating')
            ->andWhere('LOWER(scr.name) = LOWER(:name)')
            ->setParameter('competencyRating', $competencyRating)
            ->setParameter('name', $name)
            ->getQuery()
            ->getSingleScalarResult();

        return $count > 0;
    }
}
