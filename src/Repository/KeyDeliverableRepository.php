<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Appraisal;
use App\Entity\AppraisalCycle;
use App\Entity\BscPerspective;
use App\Entity\Department;
use App\Entity\KeyDeliverable;
use App\Enum\AppraisalStatus;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

/**
 * @extends ServiceEntityRepository<KeyDeliverable>
 */
class KeyDeliverableRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, KeyDeliverable::class);
    }

    /**
     * Port of KeyDeliverableViewSet.get_queryset()'s ordering:
     * perspective__sort_order, then sort_order.
     *
     * @return list<KeyDeliverable>
     */
    public function findByAppraisalOrdered(Appraisal $appraisal): array
    {
        return $this->createQueryBuilder('kd')
            ->innerJoin('kd.perspective', 'p')->addSelect('p')
            ->where('kd.appraisal = :appraisal')
            ->setParameter('appraisal', $appraisal)
            ->orderBy('p.sortOrder', 'ASC')
            ->addOrderBy('kd.sortOrder', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Port of _fetch_deliverables_data's ordering: flat `sort_order`
     * only (NOT perspective__sort_order then sort_order, unlike
     * findByAppraisalOrdered() above) — used by the appraisal PDF export.
     *
     * @return list<KeyDeliverable>
     */
    public function findByAppraisalOrderedBySortOrder(Appraisal $appraisal): array
    {
        return $this->createQueryBuilder('kd')
            ->innerJoin('kd.perspective', 'p')->addSelect('p')
            ->where('kd.appraisal = :appraisal')
            ->setParameter('appraisal', $appraisal)
            ->orderBy('kd.sortOrder', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * @return array{items: list<KeyDeliverable>, count: int}
     */
    public function findByAppraisalPaginated(Appraisal $appraisal, int $page, int $pageSize): array
    {
        $qb = $this->createQueryBuilder('kd')
            ->innerJoin('kd.perspective', 'p')->addSelect('p')
            ->where('kd.appraisal = :appraisal')
            ->setParameter('appraisal', $appraisal)
            ->orderBy('p.sortOrder', 'ASC')
            ->addOrderBy('kd.sortOrder', 'ASC');

        $countQb = (clone $qb)->select('COUNT(kd.id)')->resetDQLPart('orderBy');
        $count = (int) $countQb->getQuery()->getSingleScalarResult();

        $items = $qb->setFirstResult(($page - 1) * $pageSize)
            ->setMaxResults($pageSize)
            ->getQuery()
            ->getResult();

        return ['items' => $items, 'count' => $count];
    }

    public function findOneByAppraisalAndId(Appraisal $appraisal, string $id): ?KeyDeliverable
    {
        if (!Uuid::isValid($id)) {
            return null;
        }

        return $this->findOneBy(['appraisal' => $appraisal, 'id' => Uuid::fromString($id)]);
    }

    /**
     * @return list<KeyDeliverable>
     */
    public function findByAppraisalAndPerspective(Appraisal $appraisal, BscPerspective $perspective, ?Uuid $excludeId): array
    {
        $qb = $this->createQueryBuilder('kd')
            ->where('kd.appraisal = :appraisal')
            ->andWhere('kd.perspective = :perspective')
            ->setParameter('appraisal', $appraisal)
            ->setParameter('perspective', $perspective);

        if ($excludeId !== null) {
            $qb->andWhere('kd.id != :excludeId')->setParameter('excludeId', $excludeId);
        }

        return $qb->getQuery()->getResult();
    }

    /**
     * @return list<KeyDeliverable>
     */
    public function findByAppraisal(Appraisal $appraisal, ?Uuid $excludeId): array
    {
        $qb = $this->createQueryBuilder('kd')
            ->where('kd.appraisal = :appraisal')
            ->setParameter('appraisal', $appraisal);

        if ($excludeId !== null) {
            $qb->andWhere('kd.id != :excludeId')->setParameter('excludeId', $excludeId);
        }

        return $qb->getQuery()->getResult();
    }

    /**
     * Unordered, unfiltered fetch of every KD on the appraisal — used by
     * workflow guards, which compute their own sums/counts in PHP over
     * this small (<=17 row) set rather than via DQL aggregates.
     *
     * @return list<KeyDeliverable>
     */
    public function findAllByAppraisal(Appraisal $appraisal): array
    {
        return $this->findBy(['appraisal' => $appraisal]);
    }

    /**
     * Port of BSCPerspectiveBreakdownView._build_payload's aggregation:
     * FINALISED appraisals' KDs with a non-null weighted_score, grouped
     * by perspective (id/name/sort_order), ordered by sort_order.
     *
     * @return list<array{perspectiveId: string, perspectiveName: string, avgWeightedScore: string, appraisalCount: int}>
     */
    public function avgWeightedScoreByPerspectiveForFinalised(AppraisalCycle $cycle, ?Department $department): array
    {
        $qb = $this->createQueryBuilder('kd')
            ->select(
                'IDENTITY(kd.perspective) AS perspectiveId',
                'p.name AS perspectiveName',
                'AVG(kd.weightedScore) AS avgWeightedScore',
                'COUNT(DISTINCT kd.appraisal) AS appraisalCount',
            )
            ->innerJoin('kd.perspective', 'p')
            ->innerJoin('kd.appraisal', 'a')
            ->where('a.cycle = :cycle')
            ->andWhere('a.status = :status')
            ->andWhere('kd.weightedScore IS NOT NULL')
            ->setParameter('cycle', $cycle)
            ->setParameter('status', AppraisalStatus::FINALISED)
            ->groupBy('kd.perspective')
            ->addGroupBy('p.name')
            ->addGroupBy('p.sortOrder')
            ->orderBy('p.sortOrder', 'ASC');

        if ($department !== null) {
            $qb->innerJoin('a.employee', 'e')
                ->andWhere('e.department = :department')
                ->setParameter('department', $department);
        }

        $rows = $qb->getQuery()->getResult();

        return array_map(static fn (array $row) => [
            'perspectiveId' => (string) $row['perspectiveId'],
            'perspectiveName' => $row['perspectiveName'],
            'avgWeightedScore' => (string) $row['avgWeightedScore'],
            'appraisalCount' => (int) $row['appraisalCount'],
        ], $rows);
    }

    /**
     * Port of _build_kd_variance_rows: FINALISED appraisals' KDs with
     * both self_rating and manager_rating non-null, grouped by
     * perspective NAME only (matching Django's `.values("perspective__name")`
     * — not perspective id, an intentional Django quirk this replicates).
     *
     * @return list<array{kdTitle: string, avgSelf: string, avgManager: string, count: int}>
     */
    public function avgSelfAndManagerRatingByPerspectiveForFinalised(AppraisalCycle $cycle, ?Department $department): array
    {
        $qb = $this->createQueryBuilder('kd')
            ->select(
                'p.name AS kdTitle',
                'AVG(kd.selfRating) AS avgSelf',
                'AVG(kd.managerRating) AS avgManager',
                'COUNT(kd.id) AS cnt',
            )
            ->innerJoin('kd.perspective', 'p')
            ->innerJoin('kd.appraisal', 'a')
            ->where('a.cycle = :cycle')
            ->andWhere('a.status = :status')
            ->andWhere('kd.selfRating IS NOT NULL')
            ->andWhere('kd.managerRating IS NOT NULL')
            ->setParameter('cycle', $cycle)
            ->setParameter('status', AppraisalStatus::FINALISED)
            ->groupBy('p.name');

        if ($department !== null) {
            $qb->innerJoin('a.employee', 'e')
                ->andWhere('e.department = :department')
                ->setParameter('department', $department);
        }

        $rows = $qb->getQuery()->getResult();

        return array_map(static fn (array $row) => [
            'kdTitle' => $row['kdTitle'],
            'avgSelf' => (string) $row['avgSelf'],
            'avgManager' => (string) $row['avgManager'],
            'count' => (int) $row['cnt'],
        ], $rows);
    }
}
