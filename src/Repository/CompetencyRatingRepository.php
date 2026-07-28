<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Appraisal;
use App\Entity\AppraisalCycle;
use App\Entity\Competency;
use App\Entity\CompetencyRating;
use App\Entity\Department;
use App\Enum\AppraisalFormType;
use App\Enum\AppraisalStatus;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

/**
 * @extends ServiceEntityRepository<CompetencyRating>
 */
class CompetencyRatingRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, CompetencyRating::class);
    }

    /**
     * Ordered by competency.sortOrder, matching CompetencyRatingViewSet's
     * `.order_by("competency__sort_order")`.
     *
     * @return list<CompetencyRating>
     */
    public function findByAppraisalOrdered(Appraisal $appraisal): array
    {
        return $this->createQueryBuilder('cr')
            ->innerJoin('cr.competency', 'c')->addSelect('c')
            ->where('cr.appraisal = :appraisal')
            ->setParameter('appraisal', $appraisal)
            ->orderBy('c.sortOrder', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * @return array{items: list<CompetencyRating>, count: int}
     */
    public function findByAppraisalPaginated(Appraisal $appraisal, int $page, int $pageSize): array
    {
        $qb = $this->createQueryBuilder('cr')
            ->innerJoin('cr.competency', 'c')->addSelect('c')
            ->where('cr.appraisal = :appraisal')
            ->setParameter('appraisal', $appraisal)
            ->orderBy('c.sortOrder', 'ASC');

        $countQb = (clone $qb)->select('COUNT(cr.id)')->resetDQLPart('orderBy');
        $count = (int) $countQb->getQuery()->getSingleScalarResult();

        $items = $qb->setFirstResult(($page - 1) * $pageSize)
            ->setMaxResults($pageSize)
            ->getQuery()
            ->getResult();

        return ['items' => $items, 'count' => $count];
    }

    public function findOneByAppraisalAndId(Appraisal $appraisal, string $id): ?CompetencyRating
    {
        if (!Uuid::isValid($id)) {
            return null;
        }

        return $this->findOneBy(['appraisal' => $appraisal, 'id' => Uuid::fromString($id)]);
    }

    /**
     * Port of the (appraisal, competency) half of Django's
     * `CompetencyRating.objects.update_or_create(appraisal=..., competency_id=...)`
     * lookup used by the bulk-import executor.
     */
    public function findOneByAppraisalAndCompetency(Appraisal $appraisal, Competency $competency): ?CompetencyRating
    {
        return $this->findOneBy(['appraisal' => $appraisal, 'competency' => $competency]);
    }

    /**
     * Port of CompetencyGapReportView._build_payload's aggregation:
     * FINALISED appraisals' ratings with a non-null manager_rating,
     * grouped by competency, ordered by avg_manager_rating ascending
     * (lowest-rated competency first).
     *
     * @return list<array{competencyId: string, competencyName: string, avgManagerRating: string, appraisalCount: int}>
     */
    public function avgManagerRatingByCompetencyForFinalised(AppraisalCycle $cycle, ?AppraisalFormType $formType): array
    {
        $qb = $this->createQueryBuilder('cr')
            ->select(
                'IDENTITY(cr.competency) AS competencyId',
                'c.name AS competencyName',
                'AVG(cr.managerRating) AS avgManagerRating',
                'COUNT(DISTINCT cr.appraisal) AS appraisalCount',
            )
            ->innerJoin('cr.competency', 'c')
            ->innerJoin('cr.appraisal', 'a')
            ->where('a.cycle = :cycle')
            ->andWhere('a.status = :status')
            ->andWhere('cr.managerRating IS NOT NULL')
            ->setParameter('cycle', $cycle)
            ->setParameter('status', AppraisalStatus::FINALISED)
            ->groupBy('cr.competency')
            ->addGroupBy('c.name')
            ->orderBy('avgManagerRating', 'ASC');

        if ($formType !== null) {
            $qb->andWhere('a.formType = :formType')->setParameter('formType', $formType);
        }

        $rows = $qb->getQuery()->getResult();

        return array_map(static fn (array $row) => [
            'competencyId' => (string) $row['competencyId'],
            'competencyName' => $row['competencyName'],
            'avgManagerRating' => (string) $row['avgManagerRating'],
            'appraisalCount' => (int) $row['appraisalCount'],
        ], $rows);
    }

    /**
     * Port of _build_competency_variance_rows: FINALISED appraisals'
     * ratings with both self_rating and manager_rating non-null,
     * grouped by competency name + is_core.
     *
     * @return list<array{competencyName: string, isCore: bool, avgSelf: string, avgManager: string, count: int}>
     */
    public function avgSelfAndManagerRatingByCompetencyForFinalised(AppraisalCycle $cycle, ?Department $department): array
    {
        $qb = $this->createQueryBuilder('cr')
            ->select(
                'c.name AS competencyName',
                'c.isCore AS isCore',
                'AVG(cr.selfRating) AS avgSelf',
                'AVG(cr.managerRating) AS avgManager',
                'COUNT(cr.id) AS cnt',
            )
            ->innerJoin('cr.competency', 'c')
            ->innerJoin('cr.appraisal', 'a')
            ->where('a.cycle = :cycle')
            ->andWhere('a.status = :status')
            ->andWhere('cr.selfRating IS NOT NULL')
            ->andWhere('cr.managerRating IS NOT NULL')
            ->setParameter('cycle', $cycle)
            ->setParameter('status', AppraisalStatus::FINALISED)
            ->groupBy('c.name')
            ->addGroupBy('c.isCore');

        if ($department !== null) {
            $qb->innerJoin('a.employee', 'e')
                ->andWhere('e.department = :department')
                ->setParameter('department', $department);
        }

        $rows = $qb->getQuery()->getResult();

        return array_map(static fn (array $row) => [
            'competencyName' => $row['competencyName'],
            'isCore' => (bool) $row['isCore'],
            'avgSelf' => (string) $row['avgSelf'],
            'avgManager' => (string) $row['avgManager'],
            'count' => (int) $row['cnt'],
        ], $rows);
    }
}
