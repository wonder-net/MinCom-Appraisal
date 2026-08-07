<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Appraisal;
use App\Entity\AppraisalCycle;
use App\Entity\Department;
use App\Entity\Employee;
use App\Entity\User;
use App\Enum\AppraisalCycleStatus;
use App\Enum\AppraisalFormType;
use App\Enum\AppraisalStatus;
use App\Enum\RoleName;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\ORM\QueryBuilder;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Uid\Uuid;

/**
 * @extends ServiceEntityRepository<Appraisal>
 */
class AppraisalRepository extends ServiceEntityRepository
{
    private const SEARCH_MAX_LENGTH = 100;

    public function __construct(
        ManagerRegistry $registry,
        private readonly EmployeeRepository $employees,
    ) {
        parent::__construct($registry, Appraisal::class);
    }

    public function hasOrgWideVisibility(User $user): bool
    {
        return $user->hasAdminRole() || $user->hasRole(RoleName::HR_OFFICER) || $user->hasRole(RoleName::EXECUTIVE);
    }

    /**
     * Unscoped lookup by id — the retrieve endpoint deliberately fetches
     * unscoped so it can distinguish 404 (doesn't exist) from 403 (exists,
     * unauthorized), matching Django's explicit docblock for this
     * endpoint (a different pattern than EmployeeDetailController's
     * always-404 approach).
     */
    public function findById(string $id): ?Appraisal
    {
        if (!Uuid::isValid($id)) {
            return null;
        }

        return $this->find(Uuid::fromString($id));
    }

    /**
     * Port of the `Appraisal.objects.get_or_create(cycle=..., employee=...)`
     * lookup half used by the bulk-import executor.
     */
    public function findOneByCycleAndEmployee(AppraisalCycle $cycle, Employee $employee): ?Appraisal
    {
        return $this->findOneBy(['cycle' => $cycle, 'employee' => $employee]);
    }

    /**
     * Port of _user_can_read_appraisal. Milestone 10d backfill: once an
     * appraisal is escalated, the escalated executive gains read access
     * (mirrors _user_is_manager_of's escalation branch) while the
     * original org-hierarchy manager RETAINS read access too
     * (_user_was_original_manager_of) — only their WRITE access is
     * revoked, which is enforced separately in
     * AppraisalAccessChecker::isManagerOf(), not here.
     */
    public function canUserRead(User $user, Appraisal $appraisal): bool
    {
        if ($this->hasOrgWideVisibility($user)) {
            return true;
        }

        $escalatedExecutive = $appraisal->getEscalatedExecutive();
        if ($escalatedExecutive !== null && $escalatedExecutive->getId()->equals($user->getId())) {
            return true;
        }

        $profile = $this->employees->findByUser($user);
        if ($profile === null) {
            return false;
        }

        if ($appraisal->getEmployee()->getId()->equals($profile->getId())) {
            return true;
        }

        if (!$user->hasRole(RoleName::MANAGER)) {
            return false;
        }

        $employee = $appraisal->getEmployee();

        // HR change request #3: either appraiser (manager or matrix
        // appraiser) can read the appraisal.
        return ($employee->getManager() !== null && $employee->getManager()->getId()->equals($profile->getId()))
            || ($employee->getMatrixAppraiser() !== null && $employee->getMatrixAppraiser()->getId()->equals($profile->getId()));
    }

    /**
     * Port of AppraisalViewSet.get_queryset(): org-wide readers see all
     * appraisals; managers see their own + direct reports'; everyone else
     * sees only their own. Optional cycle_id/status/search filters.
     *
     * @return array{items: list<Appraisal>, count: int}
     */
    public function scopedList(
        User $user,
        ?string $cycleId,
        ?AppraisalStatus $status,
        ?string $search,
        int $page,
        int $pageSize,
    ): array {
        $qb = $this->createQueryBuilder('a')
            ->innerJoin('a.employee', 'e')->addSelect('e')
            ->leftJoin('e.department', 'd')->addSelect('d')
            ->leftJoin('e.manager', 'm')->addSelect('m')
            ->innerJoin('a.cycle', 'c')->addSelect('c')
            ->orderBy('e.employeeNumber', 'ASC');

        if ($this->hasOrgWideVisibility($user)) {
            // HR Admin / SYSTEM_ADMIN / HR_OFFICER / EXECUTIVE: all appraisals.
        } elseif ($user->hasRole(RoleName::MANAGER)) {
            $profile = $this->employees->findByUser($user);
            if ($profile === null) {
                return ['items' => [], 'count' => 0];
            }
            // HR change request #3: also lists appraisals for employees
            // where this user is the matrix appraiser.
            $qb->andWhere('(a.employee = :self OR e.manager = :self OR e.matrixAppraiser = :self)')->setParameter('self', $profile);
        } else {
            $profile = $this->employees->findByUser($user);
            if ($profile === null) {
                return ['items' => [], 'count' => 0];
            }
            $qb->andWhere('a.employee = :self')->setParameter('self', $profile);
        }

        if ($cycleId !== null) {
            $qb->andWhere('a.cycle = :cycleId')->setParameter('cycleId', Uuid::fromString($cycleId));
        }

        if ($status !== null) {
            $qb->andWhere('a.status = :status')->setParameter('status', $status);
        }

        $this->applySearch($qb, $search);

        $countQb = (clone $qb)->select('COUNT(a.id)')->resetDQLPart('orderBy');
        $count = (int) $countQb->getQuery()->getSingleScalarResult();

        $items = $qb->setFirstResult(($page - 1) * $pageSize)
            ->setMaxResults($pageSize)
            ->getQuery()
            ->getResult();

        return ['items' => $items, 'count' => $count];
    }

    /**
     * Port of AppraisalCycleViewSet.close()'s affected-appraisal lookup.
     * Django's terminal_statuses list here is [SIGNED_OFF, FINALISED,
     * EXCLUDED] — deliberately NOT including INCOMPLETE, matched exactly.
     *
     * @return list<Appraisal>
     */
    public function findNonTerminalByCycle(AppraisalCycle $cycle): array
    {
        return $this->createQueryBuilder('a')
            ->where('a.cycle = :cycle')
            ->andWhere('a.status NOT IN (:terminal)')
            ->setParameter('cycle', $cycle)
            ->setParameter('terminal', [AppraisalStatus::SIGNED_OFF, AppraisalStatus::FINALISED, AppraisalStatus::EXCLUDED])
            ->getQuery()
            ->getResult();
    }

    /**
     * @return list<Appraisal>
     */
    public function findSignedOffByCycle(AppraisalCycle $cycle): array
    {
        return $this->findBy(['cycle' => $cycle, 'status' => AppraisalStatus::SIGNED_OFF]);
    }

    private function applySearch(QueryBuilder $qb, ?string $search): void
    {
        $search = $search !== null ? substr(trim($search), 0, self::SEARCH_MAX_LENGTH) : '';
        if ($search === '') {
            return;
        }

        $qb->leftJoin('e.user', 'u')
            ->andWhere('(LOWER(e.employeeNumber) LIKE :search OR LOWER(u.email) LIKE :search)')
            ->setParameter('search', '%'.strtolower($search).'%');
    }

    // -----------------------------------------------------------------
    // reports app aggregation queries (Milestone 13)
    // -----------------------------------------------------------------

    /**
     * Port of `_fetch_status_counts` / `_fetch_department_status_counts`
     * (dept=null aggregates the whole cycle).
     *
     * @return array<string, int>
     */
    public function countStatusesByCycle(AppraisalCycle $cycle, ?Department $department = null): array
    {
        $qb = $this->createQueryBuilder('a')
            ->select('a.status AS status', 'COUNT(a.id) AS cnt')
            ->where('a.cycle = :cycle')
            ->setParameter('cycle', $cycle)
            ->groupBy('a.status');

        if ($department !== null) {
            $qb->innerJoin('a.employee', 'e')
                ->andWhere('e.department = :department')
                ->setParameter('department', $department);
        }

        $result = [];
        foreach ($qb->getQuery()->getResult() as $row) {
            $status = $row['status'];
            $result[$status instanceof AppraisalStatus ? $status->value : $status] = (int) $row['cnt'];
        }

        return $result;
    }

    /**
     * Port of `_fetch_total_employees` / `_fetch_department_employee_count`
     * (dept=null counts across the whole cycle).
     */
    public function countDistinctEmployeesByCycle(AppraisalCycle $cycle, ?Department $department = null): int
    {
        $qb = $this->createQueryBuilder('a')
            ->select('COUNT(DISTINCT a.employee)')
            ->where('a.cycle = :cycle')
            ->setParameter('cycle', $cycle);

        if ($department !== null) {
            $qb->innerJoin('a.employee', 'e')
                ->andWhere('e.department = :department')
                ->setParameter('department', $department);
        }

        return (int) $qb->getQuery()->getSingleScalarResult();
    }

    /**
     * Port of the overdue-count query in DashboardReportView._aggregate:
     * appraisals stuck in a non-terminal status for >14 days, using
     * statusChangedAt when set, falling back to createdAt otherwise.
     *
     * @param list<AppraisalStatus> $overdueStatuses
     */
    public function countOverdueByCycle(AppraisalCycle $cycle, array $overdueStatuses, \DateTimeImmutable $cutoff): int
    {
        return (int) $this->createQueryBuilder('a')
            ->select('COUNT(a.id)')
            ->where('a.cycle = :cycle')
            ->andWhere('a.status IN (:statuses)')
            ->andWhere('(a.statusChangedAt IS NOT NULL AND a.statusChangedAt < :cutoff) OR (a.statusChangedAt IS NULL AND a.createdAt < :cutoff)')
            ->setParameter('cycle', $cycle)
            ->setParameter('statuses', $overdueStatuses)
            ->setParameter('cutoff', $cutoff)
            ->getQuery()
            ->getSingleScalarResult();
    }

    /**
     * Port of `_fetch_department_summaries`'s first query: per-department,
     * per-status counts across an entire cycle in one query (used to
     * build the dashboard's department breakdown without N+1 queries).
     *
     * @return list<array{departmentId: string, status: string, count: int}>
     */
    public function countStatusesByCycleGroupedByDepartment(AppraisalCycle $cycle): array
    {
        $rows = $this->createQueryBuilder('a')
            ->select('IDENTITY(e.department) AS departmentId', 'a.status AS status', 'COUNT(a.id) AS cnt')
            ->innerJoin('a.employee', 'e')
            ->where('a.cycle = :cycle')
            ->setParameter('cycle', $cycle)
            ->groupBy('e.department', 'a.status')
            ->getQuery()
            ->getResult();

        return array_map(static fn (array $row) => [
            'departmentId' => (string) $row['departmentId'],
            'status' => $row['status'] instanceof AppraisalStatus ? $row['status']->value : $row['status'],
            'count' => (int) $row['cnt'],
        ], $rows);
    }

    /**
     * Port of `_fetch_department_summaries`'s second query: per-department
     * distinct employee counts across an entire cycle in one query.
     *
     * @return array<string, int> departmentId => count
     */
    public function countDistinctEmployeesByCycleGroupedByDepartment(AppraisalCycle $cycle): array
    {
        $rows = $this->createQueryBuilder('a')
            ->select('IDENTITY(e.department) AS departmentId', 'COUNT(DISTINCT a.employee) AS cnt')
            ->innerJoin('a.employee', 'e')
            ->where('a.cycle = :cycle')
            ->setParameter('cycle', $cycle)
            ->groupBy('e.department')
            ->getQuery()
            ->getResult();

        $result = [];
        foreach ($rows as $row) {
            $result[(string) $row['departmentId']] = (int) $row['cnt'];
        }

        return $result;
    }

    /**
     * Port of `_fetch_department_avg_total_score`: average total_score
     * across FINALISED appraisals in a department for a cycle, or null
     * if none exist (matches Django's Avg() returning NULL over an
     * empty set rather than 0).
     */
    public function avgTotalScoreFinalisedByCycleAndDepartment(AppraisalCycle $cycle, Department $department): ?string
    {
        $result = $this->createQueryBuilder('a')
            ->select('AVG(a.totalScore)')
            ->innerJoin('a.employee', 'e')
            ->where('a.cycle = :cycle')
            ->andWhere('e.department = :department')
            ->andWhere('a.status = :status')
            ->setParameter('cycle', $cycle)
            ->setParameter('department', $department)
            ->setParameter('status', AppraisalStatus::FINALISED)
            ->getQuery()
            ->getSingleScalarResult();

        return $result !== null ? (string) $result : null;
    }

    /**
     * Port of ScoreDistributionReportView._build_payload's aggregation:
     * FINALISED appraisals in the cycle grouped by performance_descriptor
     * (nulls excluded so total == sum(band counts)), with optional
     * department/form_type/job_family filters.
     *
     * @return array<string, int> performanceDescriptor label => count
     */
    public function countFinalisedByPerformanceDescriptor(
        AppraisalCycle $cycle,
        ?Department $department,
        ?AppraisalFormType $formType,
        ?string $jobFamily,
    ): array {
        $qb = $this->createQueryBuilder('a')
            ->select('a.performanceDescriptor AS descriptor', 'COUNT(a.id) AS cnt')
            ->where('a.cycle = :cycle')
            ->andWhere('a.status = :status')
            ->andWhere('a.performanceDescriptor IS NOT NULL')
            ->setParameter('cycle', $cycle)
            ->setParameter('status', AppraisalStatus::FINALISED)
            ->groupBy('a.performanceDescriptor');

        if ($department !== null || $jobFamily !== null) {
            $qb->innerJoin('a.employee', 'e');
        }
        if ($department !== null) {
            $qb->andWhere('e.department = :department')->setParameter('department', $department);
        }
        if ($jobFamily !== null) {
            $qb->andWhere('e.jobFamily = :jobFamily')->setParameter('jobFamily', $jobFamily);
        }
        if ($formType !== null) {
            $qb->andWhere('a.formType = :formType')->setParameter('formType', $formType);
        }

        $result = [];
        foreach ($qb->getQuery()->getResult() as $row) {
            $result[$row['descriptor']] = (int) $row['cnt'];
        }

        return $result;
    }

    /**
     * Port of ManagerEffectivenessView._build_payload +
     * _aggregate_manager_rows. Django aggregates in Python because
     * manager_name is an encrypted column there; Employee.name is
     * encrypted here too (App\Doctrine\Type\EncryptedStringType) — but
     * grouping still stays a genuine SQL GROUP BY, since every row here
     * groups by e.manager (a plain FK), not by the encrypted name's
     * ciphertext content, so it collapses correctly regardless. What
     * does NOT survive encryption is `ORDER BY mgr.name` — sorting
     * ciphertext bytes is meaningless — so ordering by manager name is
     * done in PHP by the caller (ManagerEffectivenessReportBuilder)
     * after this method decrypts each row via the Employee entity's own
     * transparent getter, not here at the DQL level. Rows with
     * teamSize == 0 (every appraisal EXCLUDED/INCOMPLETE) are filtered
     * out here by the caller, mirroring Django's skip of zero-team-size
     * managers.
     *
     * @return list<array{managerId: string, managerName: string, teamSize: int, finalisedCount: int, avgTeamScore: ?string, disputeCount: int}>
     */
    public function managerEffectivenessRowsByCycle(AppraisalCycle $cycle, ?Department $department): array
    {
        $qb = $this->createQueryBuilder('a')
            ->select(
                'IDENTITY(e.manager) AS managerId',
                'mgr.name AS managerName',
                'SUM(CASE WHEN a.status IN (:excludedStatuses) THEN 0 ELSE 1 END) AS teamSize',
                'SUM(CASE WHEN a.status = :finalisedStatus THEN 1 ELSE 0 END) AS finalisedCount',
                'SUM(CASE WHEN a.status = :disputedStatus THEN 1 ELSE 0 END) AS disputeCount',
            )
            ->innerJoin('a.employee', 'e')
            ->innerJoin('e.manager', 'mgr')
            ->where('a.cycle = :cycle')
            ->setParameter('cycle', $cycle)
            ->setParameter('excludedStatuses', [AppraisalStatus::EXCLUDED, AppraisalStatus::INCOMPLETE])
            ->setParameter('finalisedStatus', AppraisalStatus::FINALISED)
            ->setParameter('disputedStatus', AppraisalStatus::DISPUTED)
            ->groupBy('e.manager')
            ->addGroupBy('mgr.name');

        if ($department !== null) {
            $qb->andWhere('e.department = :department')->setParameter('department', $department);
        }

        $rows = $qb->getQuery()->getResult();

        // Doctrine's DQL general CASE expression mandates an ELSE clause
        // and rejects a bare NULL literal there, so avg_team_score (which
        // must stay NULL when a manager has zero FINALISED appraisals)
        // is computed as a second, FINALISED-only query and merged below
        // rather than via CASE WHEN ... THEN a.totalScore END inline above.
        $avgByManagerId = $this->avgTotalScoreFinalisedByManager($cycle, $department);

        return array_map(static fn (array $row) => [
            'managerId' => (string) $row['managerId'],
            'managerName' => $row['managerName'],
            'teamSize' => (int) $row['teamSize'],
            'finalisedCount' => (int) $row['finalisedCount'],
            'avgTeamScore' => $avgByManagerId[(string) $row['managerId']] ?? null,
            'disputeCount' => (int) $row['disputeCount'],
        ], $rows);
    }

    /**
     * @return array<string, string> managerId => avg total_score across
     *                                FINALISED appraisals for that manager's team
     */
    private function avgTotalScoreFinalisedByManager(AppraisalCycle $cycle, ?Department $department): array
    {
        $qb = $this->createQueryBuilder('a')
            ->select('IDENTITY(e.manager) AS managerId', 'AVG(a.totalScore) AS avgTeamScore')
            ->innerJoin('a.employee', 'e')
            ->where('a.cycle = :cycle')
            ->andWhere('a.status = :finalisedStatus')
            ->andWhere('e.manager IS NOT NULL')
            ->setParameter('cycle', $cycle)
            ->setParameter('finalisedStatus', AppraisalStatus::FINALISED)
            ->groupBy('e.manager');

        if ($department !== null) {
            $qb->andWhere('e.department = :department')->setParameter('department', $department);
        }

        $result = [];
        foreach ($qb->getQuery()->getResult() as $row) {
            $result[(string) $row['managerId']] = (string) $row['avgTeamScore'];
        }

        return $result;
    }

    /**
     * Port of _build_trend_data_points: FINALISED appraisals in
     * CLOSED/ARCHIVED cycles, grouped by cycle, ordered by cycle
     * start_date ascending (chronological, for trend charting).
     * Unlike every other filterable report, Django's CrossCycleTrendView
     * never checks department_id for existence (no 404 branch) — a
     * nonexistent department simply yields zero matching rows here,
     * matching that exactly, so this takes a raw id rather than a
     * resolved Department entity.
     *
     * @return list<array{cycleId: string, cycleName: string, cycleYear: int, avgTotalScore: ?string, appraisalCount: int}>
     */
    public function trendDataPointsByDepartment(?Uuid $departmentId): array
    {
        $qb = $this->createQueryBuilder('a')
            ->select(
                'IDENTITY(a.cycle) AS cycleId',
                'c.periodName AS cycleName',
                'c.startDate AS cycleStartDate',
                'AVG(a.totalScore) AS avgTotalScore',
                'COUNT(a.id) AS appraisalCount',
            )
            ->innerJoin('a.cycle', 'c')
            ->where('c.status IN (:cycleStatuses)')
            ->andWhere('a.status = :status')
            ->setParameter('cycleStatuses', [AppraisalCycleStatus::CLOSED, AppraisalCycleStatus::ARCHIVED])
            ->setParameter('status', AppraisalStatus::FINALISED)
            ->groupBy('a.cycle')
            ->addGroupBy('c.periodName')
            ->addGroupBy('c.startDate')
            ->orderBy('c.startDate', 'ASC');

        if ($departmentId !== null) {
            $qb->innerJoin('a.employee', 'e')
                ->andWhere('IDENTITY(e.department) = :departmentId')
                ->setParameter('departmentId', $departmentId);
        }

        $rows = $qb->getQuery()->getResult();

        return array_map(static fn (array $row) => [
            'cycleId' => (string) $row['cycleId'],
            'cycleName' => $row['cycleName'],
            'cycleYear' => (int) $row['cycleStartDate']->format('Y'),
            'avgTotalScore' => $row['avgTotalScore'] !== null ? (string) $row['avgTotalScore'] : null,
            'appraisalCount' => (int) $row['appraisalCount'],
        ], $rows);
    }

    /**
     * Port of EmployeeAppraisalHistoryView's history query: all
     * appraisals for the employee across every cycle, ordered by cycle
     * start_date ascending (chronological). Uncached (matches Django).
     *
     * @return list<Appraisal>
     */
    public function findByEmployeeOrderedByCycleStartDate(Employee $employee): array
    {
        return $this->createQueryBuilder('a')
            ->innerJoin('a.cycle', 'c')->addSelect('c')
            ->where('a.employee = :employee')
            ->setParameter('employee', $employee)
            ->orderBy('c.startDate', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Port of DisputeLogReportView._build_payload's second query:
     * DISPUTED appraisals in the cycle NOT already covered by a
     * REJECT/COMMENTS_ATTACHED signature.
     *
     * @param list<Uuid> $excludedAppraisalIds
     * @return list<Appraisal>
     */
    public function findDisputedByCycleExcludingIds(AppraisalCycle $cycle, array $excludedAppraisalIds): array
    {
        $qb = $this->createQueryBuilder('a')
            ->innerJoin('a.employee', 'e')->addSelect('e')
            ->innerJoin('e.department', 'd')->addSelect('d')
            ->innerJoin('a.cycle', 'c')->addSelect('c')
            ->where('a.cycle = :cycle')
            ->andWhere('a.status = :status')
            ->setParameter('cycle', $cycle)
            ->setParameter('status', AppraisalStatus::DISPUTED);

        if ($excludedAppraisalIds !== []) {
            $qb->andWhere('a.id NOT IN (:excludedIds)')->setParameter('excludedIds', $excludedAppraisalIds);
        }

        return $qb->getQuery()->getResult();
    }

    /**
     * Port of BulkCSVExportView.get's queryset: FINALISED appraisals in
     * the cycle, ordered by employee_number.
     *
     * @return list<Appraisal>
     */
    public function findFinalisedByCycleOrderedByEmployeeNumber(AppraisalCycle $cycle): array
    {
        return $this->createQueryBuilder('a')
            ->innerJoin('a.employee', 'e')->addSelect('e')
            ->innerJoin('e.department', 'd')->addSelect('d')
            ->innerJoin('a.cycle', 'c')->addSelect('c')
            ->where('a.cycle = :cycle')
            ->andWhere('a.status = :status')
            ->setParameter('cycle', $cycle)
            ->setParameter('status', AppraisalStatus::FINALISED)
            ->orderBy('e.employeeNumber', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Row count for BulkCSVExportView's audit-log metadata — Django
     * computes `row_count = appraisals.count()` as a separate query
     * from the row-streaming iterator; mirrored here rather than
     * counting the (already-hydrated) findFinalisedByCycleOrderedByEmployeeNumber() result.
     */
    public function countFinalisedByCycle(AppraisalCycle $cycle): int
    {
        return (int) $this->createQueryBuilder('a')
            ->select('COUNT(a.id)')
            ->where('a.cycle = :cycle')
            ->andWhere('a.status = :status')
            ->setParameter('cycle', $cycle)
            ->setParameter('status', AppraisalStatus::FINALISED)
            ->getQuery()
            ->getSingleScalarResult();
    }

    /**
     * Port of AuditCompliancePDFView.get's queryset: every appraisal in
     * the cycle (any status), ordered by `employee__department_id,
     * employee_id` — Django orders by the raw FK id columns, not a
     * human-readable field, matched exactly here rather than
     * substituting a "nicer" department-name/employee-number sort.
     *
     * @return list<Appraisal>
     */
    public function findByCycleOrderedByDepartmentAndEmployeeId(AppraisalCycle $cycle): array
    {
        return $this->createQueryBuilder('a')
            ->innerJoin('a.employee', 'e')->addSelect('e')
            ->innerJoin('e.department', 'd')->addSelect('d')
            ->where('a.cycle = :cycle')
            ->setParameter('cycle', $cycle)
            ->orderBy('IDENTITY(e.department)', 'ASC')
            ->addOrderBy('IDENTITY(a.employee)', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Port of the queryset built in apps.notifications.tasks.send_overdue_reminders:
     * non-terminal appraisals in ACTIVE cycles (across all cycles, not
     * scoped to one) whose statusChangedAt (or createdAt, when null) is
     * older than the cutoff. Eager-loads employee/user/manager/cycle to
     * match Django's select_related and avoid N+1 queries in the
     * per-appraisal recipient resolution that follows.
     *
     * @param list<AppraisalStatus> $nonTerminalStatuses
     *
     * @return list<Appraisal>
     */
    public function findOverdueInActiveCycles(array $nonTerminalStatuses, \DateTimeImmutable $cutoff): array
    {
        return $this->createQueryBuilder('a')
            ->innerJoin('a.cycle', 'c')->addSelect('c')
            ->innerJoin('a.employee', 'e')->addSelect('e')
            ->innerJoin('e.user', 'eu')->addSelect('eu')
            ->leftJoin('e.manager', 'm')->addSelect('m')
            ->leftJoin('m.user', 'mu')->addSelect('mu')
            ->where('c.status = :cycleStatus')
            ->andWhere('a.status IN (:statuses)')
            ->andWhere('(a.statusChangedAt IS NOT NULL AND a.statusChangedAt < :cutoff) OR (a.statusChangedAt IS NULL AND a.createdAt < :cutoff)')
            ->setParameter('cycleStatus', AppraisalCycleStatus::ACTIVE)
            ->setParameter('statuses', $nonTerminalStatuses)
            ->setParameter('cutoff', $cutoff)
            ->getQuery()
            ->getResult();
    }
}
