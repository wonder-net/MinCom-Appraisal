<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\AppraisalCycle;
use App\Entity\CalibrationSession;
use App\Entity\Department;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<CalibrationSession>
 */
class CalibrationSessionRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, CalibrationSession::class);
    }

    public function findOneByCycleAndDepartment(AppraisalCycle $cycle, Department $department): ?CalibrationSession
    {
        return $this->findOneBy(['cycle' => $cycle, 'department' => $department]);
    }

    /**
     * Batch lookup for CalibrationService::overview() — one query for
     * every department's session in a cycle rather than one per row.
     *
     * @return array<string, CalibrationSession> keyed by department ID string
     */
    public function findByCycleIndexedByDepartment(AppraisalCycle $cycle): array
    {
        $rows = $this->findBy(['cycle' => $cycle]);

        $indexed = [];
        foreach ($rows as $session) {
            $indexed[(string) $session->getDepartment()->getId()] = $session;
        }

        return $indexed;
    }
}
