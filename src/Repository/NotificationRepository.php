<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Appraisal;
use App\Entity\Notification;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

/**
 * @extends ServiceEntityRepository<Notification>
 */
class NotificationRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Notification::class);
    }

    /**
     * Port of NotificationListView's queryset: recipient-scoped, ordered
     * -created_at, paginated. `id DESC` is a secondary tiebreaker (not
     * present in Django, whose ordering is `-created_at` alone) —
     * `created_at` has whole-second precision, so two notifications
     * created within the same second (e.g. the multi-recipient
     * dispatch on a dispute/sign-off transition) would otherwise sort
     * in arbitrary order; UUIDv7 ids are themselves time-ordered, so
     * this keeps same-second rows in creation order deterministically.
     *
     * @return array{items: list<Notification>, count: int}
     */
    public function findByRecipientPaginated(User $recipient, int $page, int $pageSize): array
    {
        $qb = $this->createQueryBuilder('n')
            ->where('n.recipient = :recipient')
            ->setParameter('recipient', $recipient)
            ->orderBy('n.createdAt', 'DESC')
            ->addOrderBy('n.id', 'DESC');

        $countQb = (clone $qb)->select('COUNT(n.id)')->resetDQLPart('orderBy');
        $count = (int) $countQb->getQuery()->getSingleScalarResult();

        $items = $qb->setFirstResult(($page - 1) * $pageSize)
            ->setMaxResults($pageSize)
            ->getQuery()
            ->getResult();

        return ['items' => $items, 'count' => $count];
    }

    public function countUnreadByRecipient(User $recipient): int
    {
        return $this->count(['recipient' => $recipient, 'isRead' => false]);
    }

    /**
     * Unscoped lookup by id — MarkReadController distinguishes 404
     * (doesn't exist) from 403 (exists, not owned by requester), same
     * pattern as AppraisalRepository::findById().
     */
    public function findById(string $id): ?Notification
    {
        if (!Uuid::isValid($id)) {
            return null;
        }

        return $this->find(Uuid::fromString($id));
    }

    /**
     * Port of MarkAllReadView's `.update(is_read=True)` bulk update.
     * Returns the number of rows actually flipped from unread to read.
     */
    public function markAllReadForRecipient(User $recipient): int
    {
        return $this->createQueryBuilder('n')
            ->update()
            ->set('n.isRead', 'true')
            ->where('n.recipient = :recipient')
            ->andWhere('n.isRead = false')
            ->setParameter('recipient', $recipient)
            ->getQuery()
            ->execute();
    }

    /**
     * Port of the idempotency guard in
     * apps.notifications.tasks.send_overdue_reminders: true if an
     * OVERDUE notification already exists for this appraisal within
     * the given cutoff (the 24h idempotency window).
     */
    public function existsForAppraisalSince(Appraisal $appraisal, string $eventType, \DateTimeImmutable $since): bool
    {
        $count = (int) $this->createQueryBuilder('n')
            ->select('COUNT(n.id)')
            ->where('n.appraisal = :appraisal')
            ->andWhere('n.eventType = :eventType')
            ->andWhere('n.createdAt >= :since')
            ->setParameter('appraisal', $appraisal)
            ->setParameter('eventType', $eventType)
            ->setParameter('since', $since)
            ->getQuery()
            ->getSingleScalarResult();

        return $count > 0;
    }
}
