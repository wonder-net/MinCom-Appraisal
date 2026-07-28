<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\RefreshToken;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Gesdinet\JWTRefreshTokenBundle\Doctrine\RefreshTokenRepositoryInterface;

/**
 * Extends ServiceEntityRepository (not plain EntityRepository) so it can be
 * autowired directly as a service (e.g. into TokenService) — plain
 * EntityRepository's constructor needs a ClassMetadata the container can't
 * supply on its own.
 *
 * @extends ServiceEntityRepository<RefreshToken>
 * @implements RefreshTokenRepositoryInterface<RefreshToken>
 */
class RefreshTokenRepository extends ServiceEntityRepository implements RefreshTokenRepositoryInterface
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, RefreshToken::class);
    }

    /**
     * @return iterable<RefreshToken>
     */
    public function findInvalid(?\DateTimeInterface $datetime = null): iterable
    {
        return $this->createQueryBuilder('t')
            ->where('t.valid < :datetime')
            ->setParameter('datetime', $datetime ?? new \DateTime())
            ->getQuery()
            ->getResult();
    }

    /**
     * @return iterable<RefreshToken>
     */
    public function findInvalidBatch(?\DateTimeInterface $datetime = null, ?int $batchSize = null, int $offset = 0): iterable
    {
        return $this->createQueryBuilder('t')
            ->where('t.valid < :datetime')
            ->setParameter('datetime', $datetime ?? new \DateTime())
            ->setFirstResult($offset)
            ->setMaxResults($batchSize)
            ->getQuery()
            ->getResult();
    }

    /**
     * Deletes every refresh token for a username, mirroring
     * TokenService.revoke_all_tokens_for_user's blanket revocation.
     *
     * @return int number of rows deleted
     */
    public function deleteAllForUsername(string $username): int
    {
        return $this->createQueryBuilder('t')
            ->delete()
            ->where('t.username = :username')
            ->setParameter('username', $username)
            ->getQuery()
            ->execute();
    }
}
