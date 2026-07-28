<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\RecoveryCode;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<RecoveryCode>
 */
class RecoveryCodeRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, RecoveryCode::class);
    }

    /**
     * @return list<RecoveryCode>
     */
    public function findUnusedForUser(User $user): array
    {
        return $this->findBy(['user' => $user, 'isUsed' => false]);
    }

    public function countUnusedForUser(User $user): int
    {
        return $this->count(['user' => $user, 'isUsed' => false]);
    }

    public function deleteUnusedForUser(User $user): void
    {
        $this->createQueryBuilder('c')
            ->delete()
            ->where('c.user = :user')
            ->andWhere('c.isUsed = false')
            ->setParameter('user', $user)
            ->getQuery()
            ->execute();
    }

    public function deleteAllForUser(User $user): void
    {
        $this->createQueryBuilder('c')
            ->delete()
            ->where('c.user = :user')
            ->setParameter('user', $user)
            ->getQuery()
            ->execute();
    }
}
