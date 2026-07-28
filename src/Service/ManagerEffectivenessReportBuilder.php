<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\AppraisalCycle;
use App\Entity\Department;
use App\Repository\AppraisalRepository;

/**
 * Port of apps.reports.views.ManagerEffectivenessView._build_payload +
 * _aggregate_manager_rows. Sorts by manager name in PHP (not SQL
 * `ORDER BY`) since Employee.name is encrypted at rest — see
 * AppraisalRepository::managerEffectivenessRowsByCycle()'s docblock.
 */
final class ManagerEffectivenessReportBuilder
{
    private const SCALE = 10;

    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly ReportCalculations $calculations,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(AppraisalCycle $cycle, ?Department $department): array
    {
        $rows = $this->appraisals->managerEffectivenessRowsByCycle($cycle, $department);

        $managers = [];
        foreach ($rows as $row) {
            if ($row['teamSize'] === 0) {
                continue;
            }

            $completionRate = bcmul(
                bcdiv((string) ($row['finalisedCount'] * 100), (string) $row['teamSize'], self::SCALE),
                '1',
                self::SCALE,
            );

            $managers[] = [
                'manager_id' => $row['managerId'],
                'manager_name' => $row['managerName'],
                'team_size' => $row['teamSize'],
                'completion_rate' => $this->calculations->roundHalfEven($completionRate, 2),
                'avg_team_score' => $row['avgTeamScore'] !== null ? $this->calculations->roundHalfEven($row['avgTeamScore'], 2) : null,
                'dispute_count' => $row['disputeCount'],
            ];
        }

        usort($managers, static fn (array $a, array $b): int => $a['manager_name'] <=> $b['manager_name']);

        return [
            'cycle_id' => (string) $cycle->getId(),
            'department_id' => $department !== null ? (string) $department->getId() : null,
            'managers' => $managers,
        ];
    }
}
