<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Appraisal;
use App\Entity\AppraisalCycle;
use App\Entity\Department;
use App\Entity\Employee;
use App\Entity\User;
use App\Enum\RoleName;
use App\Service\EmployeeNumberNormalizer;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\ORM\QueryBuilder;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

/**
 * @extends ServiceEntityRepository<Employee>
 */
class EmployeeRepository extends ServiceEntityRepository
{
    private const SEARCH_MAX_LENGTH = 100;

    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Employee::class);
    }

    /**
     * Active employees excluding those whose linked User holds the
     * EXECUTIVE role — per stakeholder decision (TASK-278), executives
     * are not appraised through the platform (they participate via
     * escalation/governance reads only). Used by cycle activation
     * (AppraisalInstanceBuilder).
     *
     * @return list<Employee>
     */
    public function findActiveExcludingExecutives(): array
    {
        $subQuery = $this->getEntityManager()->createQueryBuilder()
            ->select('e2.id')
            ->from(Employee::class, 'e2')
            ->innerJoin('e2.user', 'u2')
            ->innerJoin('u2.assignedRoles', 'r2')
            ->where('r2.name = :executiveRole')
            ->getDQL();

        return $this->createQueryBuilder('e')
            ->where('e.isActive = true')
            ->andWhere("e.id NOT IN ($subQuery)")
            ->setParameter('executiveRole', RoleName::EXECUTIVE)
            ->getQuery()
            ->getResult();
    }

    /**
     * All active employees with department eager-loaded — used by the
     * appraisal bulk-import fuzzy matcher, which needs the full active
     * population (unlike findActiveExcludingExecutives(), executives
     * are not excluded here since they can legitimately be the
     * appraisee on a file being matched).
     *
     * @return list<Employee>
     */
    public function findAllActive(): array
    {
        return $this->createQueryBuilder('e')
            ->innerJoin('e.department', 'd')->addSelect('d')
            ->where('e.isActive = true')
            ->getQuery()
            ->getResult();
    }

    public function findByUser(User $user): ?Employee
    {
        return $this->findOneBy(['user' => $user]);
    }

    /**
     * Looks up by the *normalised* employee number, so "emp-001", "EMP 001"
     * and "EMP001" all match the row stored as "EMP001". Active employees
     * only, mirroring Django's default ActiveEmployeeManager.
     */
    public function findByEmployeeNumber(string $employeeNumber): ?Employee
    {
        return $this->findOneBy(['employeeNumber' => EmployeeNumberNormalizer::normalize($employeeNumber), 'isActive' => true]);
    }

    public function findActiveById(string $id): ?Employee
    {
        if (!Uuid::isValid($id)) {
            return null;
        }

        return $this->findOneBy(['id' => $id, 'isActive' => true]);
    }

    /**
     * Bulk existence check across active AND inactive employees, mirroring
     * Django's Employee.all_objects — a reused employee number from a
     * deactivated employee is still a duplicate.
     *
     * @param list<string> $normalizedEmployeeNumbers
     *
     * @return list<string>
     */
    public function findExistingEmployeeNumbers(array $normalizedEmployeeNumbers): array
    {
        if ($normalizedEmployeeNumbers === []) {
            return [];
        }

        $result = $this->createQueryBuilder('e')
            ->select('e.employeeNumber')
            ->where('e.employeeNumber IN (:numbers)')
            ->setParameter('numbers', $normalizedEmployeeNumbers)
            ->getQuery()
            ->getScalarResult();

        return array_column($result, 'employeeNumber');
    }

    /**
     * Port of the admin user-update view's employee_number conflict check:
     * `Employee.all_objects.filter(employee_number=...).exclude(pk=employee_profile.pk).exists()`
     * — active AND inactive, excluding the employee's own row (a no-op
     * rename to the same normalised value is not a conflict).
     */
    public function existsByEmployeeNumberExcluding(string $normalizedEmployeeNumber, Uuid $excludeId): bool
    {
        $count = $this->createQueryBuilder('e')
            ->select('COUNT(e.id)')
            ->where('e.employeeNumber = :number')
            ->andWhere('e.id != :excludeId')
            ->setParameter('number', $normalizedEmployeeNumber)
            ->setParameter('excludeId', $excludeId)
            ->getQuery()
            ->getSingleScalarResult();

        return (int) $count > 0;
    }

    /**
     * Bulk existence check for candidate appraisors — active only,
     * mirroring Django's default ActiveEmployeeManager.
     *
     * @param list<string> $normalizedEmployeeNumbers
     *
     * @return list<string>
     */
    public function findExistingActiveEmployeeNumbers(array $normalizedEmployeeNumbers): array
    {
        if ($normalizedEmployeeNumbers === []) {
            return [];
        }

        $result = $this->createQueryBuilder('e')
            ->select('e.employeeNumber')
            ->where('e.employeeNumber IN (:numbers)')
            ->andWhere('e.isActive = true')
            ->setParameter('numbers', $normalizedEmployeeNumbers)
            ->getQuery()
            ->getScalarResult();

        return array_column($result, 'employeeNumber');
    }

    /**
     * Port of EmployeeViewSet.get_queryset(): RBAC-scoped, optionally
     * search-filtered, page-number paginated.
     *
     * @return array{items: list<Employee>, count: int}
     */
    public function scopedList(User $user, ?string $search, int $page, int $pageSize): array
    {
        $qb = $this->createQueryBuilder('e')->where('e.isActive = true');

        if ($this->hasOrgWideVisibility($user)) {
            // HR Admin / SYSTEM_ADMIN / HR_OFFICER / EXECUTIVE: all active employees.
        } elseif ($user->hasRole(RoleName::MANAGER)) {
            $profile = $this->findByUser($user);
            if ($profile === null) {
                return ['items' => [], 'count' => 0];
            }
            $qb->andWhere('(e = :self OR e.manager = :self)')->setParameter('self', $profile);
        } else {
            $profile = $this->findByUser($user);
            if ($profile === null) {
                return ['items' => [], 'count' => 0];
            }
            $qb->andWhere('e = :self')->setParameter('self', $profile);
        }

        $this->applySearch($qb, $search);
        $qb->orderBy('e.employeeNumber', 'ASC');

        return $this->paginate($qb, $page, $pageSize);
    }

    /**
     * @return array{items: list<Employee>, count: int}
     */
    public function findActiveDirectReports(Employee $manager, int $page, int $pageSize): array
    {
        $qb = $this->createQueryBuilder('e')
            ->where('e.manager = :manager')
            ->andWhere('e.isActive = true')
            ->setParameter('manager', $manager)
            ->orderBy('e.employeeNumber', 'ASC');

        return $this->paginate($qb, $page, $pageSize);
    }

    public function hasOrgWideVisibility(User $user): bool
    {
        return $user->hasAdminRole() || $user->hasRole(RoleName::HR_OFFICER) || $user->hasRole(RoleName::EXECUTIVE);
    }

    /**
     * @return list<string>
     */
    public function findDistinctLocations(): array
    {
        $result = $this->createQueryBuilder('e')
            ->select('DISTINCT e.location')
            ->where("e.location != ''")
            ->orderBy('e.location', 'ASC')
            ->getQuery()
            ->getScalarResult();

        return array_column($result, 'location');
    }

    /**
     * @return list<string>
     */
    public function findDistinctJobFamilies(): array
    {
        $result = $this->createQueryBuilder('e')
            ->select('DISTINCT e.jobFamily')
            ->where("e.jobFamily != ''")
            ->orderBy('e.jobFamily', 'ASC')
            ->getQuery()
            ->getScalarResult();

        return array_column($result, 'jobFamily');
    }

    private function applySearch(QueryBuilder $qb, ?string $search): void
    {
        $search = $search !== null ? substr(trim($search), 0, self::SEARCH_MAX_LENGTH) : '';
        if ($search === '') {
            return;
        }

        $qb->join('e.user', 'u')
            ->andWhere('(LOWER(e.employeeNumber) LIKE :search OR LOWER(u.email) LIKE :search)')
            ->setParameter('search', '%'.strtolower($search).'%');
    }

    /**
     * @return array{items: list<Employee>, count: int}
     */
    /**
     * Port of UnapraisedReportView._build_payload's queryset: active
     * employees, excluding EXECUTIVE/SYSTEM_ADMIN (never subject to
     * appraisal, TASK-295/TASK-303), excluding anyone with an existing
     * Appraisal in the cycle, optionally scoped to a department,
     * ordered by department name then employee number.
     *
     * @return list<Employee>
     */
    public function findUnapprisedForCycle(AppraisalCycle $cycle, ?Department $department): array
    {
        $appraisedSubQuery = $this->getEntityManager()->createQueryBuilder()
            ->select('IDENTITY(a.employee)')
            ->from(Appraisal::class, 'a')
            ->where('a.cycle = :cycle')
            ->getDQL();

        $excludedRolesSubQuery = $this->getEntityManager()->createQueryBuilder()
            ->select('e2.id')
            ->from(Employee::class, 'e2')
            ->innerJoin('e2.user', 'u2')
            ->innerJoin('u2.assignedRoles', 'r2')
            ->where('r2.name IN (:excludedRoles)')
            ->getDQL();

        $qb = $this->createQueryBuilder('e')
            ->innerJoin('e.department', 'd')->addSelect('d')
            ->leftJoin('e.manager', 'm')->addSelect('m')
            ->where('e.isActive = true')
            ->andWhere("e.id NOT IN ($excludedRolesSubQuery)")
            ->andWhere("e.id NOT IN ($appraisedSubQuery)")
            ->setParameter('excludedRoles', [RoleName::EXECUTIVE, RoleName::SYSTEM_ADMIN])
            ->setParameter('cycle', $cycle)
            ->orderBy('d.name', 'ASC')
            ->addOrderBy('e.employeeNumber', 'ASC');

        if ($department !== null) {
            $qb->andWhere('e.department = :department')->setParameter('department', $department);
        }

        return $qb->getQuery()->getResult();
    }

    private function paginate(QueryBuilder $qb, int $page, int $pageSize): array
    {
        $countQb = (clone $qb)->select('COUNT(e.id)')->resetDQLPart('orderBy');
        $count = (int) $countQb->getQuery()->getSingleScalarResult();

        $items = $qb->setFirstResult(($page - 1) * $pageSize)
            ->setMaxResults($pageSize)
            ->getQuery()
            ->getResult();

        return ['items' => $items, 'count' => $count];
    }
}
