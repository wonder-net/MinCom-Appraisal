<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\AppraisalCycle;
use App\Entity\User;
use App\Enum\AppraisalCycleStatus;
use App\Enum\RoleName;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<AppraisalCycle>
 */
class AppraisalCycleRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, AppraisalCycle::class);
    }

    public function hasOrgWideVisibility(User $user): bool
    {
        return $user->hasAdminRole() || $user->hasRole(RoleName::HR_OFFICER);
    }

    /**
     * Port of `AppraisalCycle.objects.filter(status=ACTIVE).first()`,
     * used by the bulk-import executor and reports' `_resolve_cycle`
     * when no cycle_id is supplied. Explicit `-start_date` ordering
     * matches Django's model Meta.ordering (which `.first()` relies on
     * implicitly) so the choice is deterministic if more than one
     * ACTIVE cycle ever exists.
     */
    public function findOneActive(): ?AppraisalCycle
    {
        return $this->createQueryBuilder('c')
            ->where('c.status = :status')
            ->setParameter('status', AppraisalCycleStatus::ACTIVE)
            ->orderBy('c.startDate', 'DESC')
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * Port of AppraisalCycleViewSet.get_queryset(): HR Admin/HR Officer see
     * all cycles (DRAFT/ACTIVE/CLOSED/ARCHIVED); everyone else sees ACTIVE
     * only. Ordered by -start_date, matching Django's Meta.ordering.
     *
     * @return array{items: list<AppraisalCycle>, count: int}
     */
    public function scopedList(User $user, int $page, int $pageSize): array
    {
        $qb = $this->createQueryBuilder('c')->orderBy('c.startDate', 'DESC');

        if (!$this->hasOrgWideVisibility($user)) {
            $qb->andWhere('c.status = :status')->setParameter('status', AppraisalCycleStatus::ACTIVE);
        }

        $countQb = (clone $qb)->select('COUNT(c.id)')->resetDQLPart('orderBy');
        $count = (int) $countQb->getQuery()->getSingleScalarResult();

        $items = $qb->setFirstResult(($page - 1) * $pageSize)
            ->setMaxResults($pageSize)
            ->getQuery()
            ->getResult();

        return ['items' => $items, 'count' => $count];
    }
}
