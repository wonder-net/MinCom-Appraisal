<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\AuditLog;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\DBAL\LockMode;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

/**
 * @extends ServiceEntityRepository<AuditLog>
 *
 * Deliberately exposes no update/delete helpers — AuditLog rows are
 * append-only (see AuditLog's own docblock for the three enforcement
 * layers). Only read queries and AuditService's single insert path
 * belong here.
 *
 * @phpstan-type AuditFilters array{action?: string, resourceType?: string, resourceId?: Uuid, userId?: Uuid, timestampGte?: \DateTimeImmutable, timestampLte?: \DateTimeImmutable}
 * @phpstan-type AuditPosition array{ts: \DateTimeImmutable, id: Uuid}
 */
class AuditLogRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, AuditLog::class);
    }

    /**
     * Port of AuditLog.save()'s `select_for_update().order_by("-timestamp", "-id").first()`
     * lookup: the current chain tail, locked for the duration of the
     * enclosing transaction so concurrent appends serialise correctly.
     */
    public function findLastForUpdate(): ?AuditLog
    {
        return $this->createQueryBuilder('a')
            ->orderBy('a.timestamp', 'DESC')
            ->addOrderBy('a.id', 'DESC')
            ->setMaxResults(1)
            ->getQuery()
            ->setLockMode(LockMode::PESSIMISTIC_WRITE)
            ->getOneOrNullResult();
    }

    /**
     * Port of AuditLog.verify_chain()'s ordered full-chain fetch,
     * optionally bounded by (timestamp, id) on either end — see
     * AuditChainVerifier for the bound-resolution logic.
     *
     * @return list<AuditLog>
     */
    public function findChain(?AuditLog $startBound, ?AuditLog $endBound): array
    {
        $qb = $this->createQueryBuilder('a')
            ->orderBy('a.timestamp', 'ASC')
            ->addOrderBy('a.id', 'ASC');

        if ($startBound !== null) {
            $qb->andWhere('a.timestamp > :startTs OR (a.timestamp = :startTs AND a.id >= :startId)')
                ->setParameter('startTs', $startBound->getTimestamp())
                ->setParameter('startId', $startBound->getId());
        }

        if ($endBound !== null) {
            $qb->andWhere('a.timestamp < :endTs OR (a.timestamp = :endTs AND a.id <= :endId)')
                ->setParameter('endTs', $endBound->getTimestamp())
                ->setParameter('endId', $endBound->getId());
        }

        return $qb->getQuery()->getResult();
    }

    /**
     * The entry immediately preceding the given one in chain order —
     * used by verify_chain() to resolve the expected previousHash of
     * the first entry in a bounded (start_id-only) range.
     */
    public function findPredecessor(AuditLog $entry): ?AuditLog
    {
        return $this->createQueryBuilder('a')
            ->where('a.timestamp < :ts OR (a.timestamp = :ts AND a.id < :id)')
            ->setParameter('ts', $entry->getTimestamp())
            ->setParameter('id', $entry->getId())
            ->orderBy('a.timestamp', 'DESC')
            ->addOrderBy('a.id', 'DESC')
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * Port of AuditLogListView/AuditLogByResourceView's filterable,
     * keyset-paginated query (the resource-scoped view is just this
     * same query with resourceType/resourceId always present in
     * $filters — Django gives it a separate view class, but the
     * queryset shape is identical). Ordered `-timestamp, -id` (most
     * recent first), matching AuditCursorPagination's `-timestamp`
     * ordering with `id` as the tie-breaking secondary key DRF's
     * CursorPagination adds automatically for non-unique orderings.
     *
     * @param AuditFilters $filters
     * @param ?AuditPosition $after
     * @return list<AuditLog>
     */
    public function findPage(array $filters, ?array $after, int $limit): array
    {
        $qb = $this->createQueryBuilder('a')
            ->orderBy('a.timestamp', 'DESC')
            ->addOrderBy('a.id', 'DESC')
            ->setMaxResults($limit);

        $this->applyFilters($qb, $filters);

        if ($after !== null) {
            $qb->andWhere('a.timestamp < :afterTs OR (a.timestamp = :afterTs AND a.id < :afterId)')
                ->setParameter('afterTs', $after['ts'])
                ->setParameter('afterId', $after['id']);
        }

        return $qb->getQuery()->getResult();
    }

    /**
     * The reverse-direction page (for "previous" cursor navigation):
     * entries strictly AFTER `$before` in chain order (i.e. newer),
     * fetched ascending then reversed by the caller back to descending
     * display order.
     *
     * @param AuditFilters $filters
     * @param AuditPosition $before
     * @return list<AuditLog>
     */
    public function findPageBefore(array $filters, array $before, int $limit): array
    {
        $qb = $this->createQueryBuilder('a')
            ->orderBy('a.timestamp', 'ASC')
            ->addOrderBy('a.id', 'ASC')
            ->setMaxResults($limit);

        $this->applyFilters($qb, $filters);

        $qb->andWhere('a.timestamp > :beforeTs OR (a.timestamp = :beforeTs AND a.id > :beforeId)')
            ->setParameter('beforeTs', $before['ts'])
            ->setParameter('beforeId', $before['id']);

        return $qb->getQuery()->getResult();
    }

    /**
     * @param \Doctrine\ORM\QueryBuilder $qb
     * @param AuditFilters $filters
     */
    private function applyFilters($qb, array $filters): void
    {
        if (isset($filters['action'])) {
            $qb->andWhere('a.action = :faction')->setParameter('faction', $filters['action']);
        }
        if (isset($filters['resourceType'])) {
            $qb->andWhere('a.resourceType = :fresourceType')->setParameter('fresourceType', $filters['resourceType']);
        }
        if (isset($filters['resourceId'])) {
            $qb->andWhere('a.resourceId = :fresourceId')->setParameter('fresourceId', $filters['resourceId']);
        }
        if (isset($filters['userId'])) {
            $qb->andWhere('a.userId = :fuserId')->setParameter('fuserId', $filters['userId']);
        }
        if (isset($filters['timestampGte'])) {
            $qb->andWhere('a.timestamp >= :tsGte')->setParameter('tsGte', $filters['timestampGte']);
        }
        if (isset($filters['timestampLte'])) {
            $qb->andWhere('a.timestamp <= :tsLte')->setParameter('tsLte', $filters['timestampLte']);
        }
    }
}
