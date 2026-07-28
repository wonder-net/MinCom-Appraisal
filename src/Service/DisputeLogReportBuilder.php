<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Appraisal;
use App\Entity\AppraisalCycle;
use App\Entity\Signature;
use App\Repository\AppraisalRepository;
use App\Repository\SignatureRepository;

/**
 * Port of apps.reports.views.{DisputeLogReportView, _build_dispute_row_from_signature,
 * _build_dispute_row_from_appraisal, _sort_dispute_rows}.
 */
final class DisputeLogReportBuilder
{
    public function __construct(
        private readonly SignatureRepository $signatures,
        private readonly AppraisalRepository $appraisals,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(AppraisalCycle $cycle): array
    {
        $signatures = $this->signatures->findDisputeActionsByCycle($cycle);
        $rows = array_map(fn (Signature $s) => $this->rowFromSignature($s), $signatures);

        $excludedIds = array_map(static fn (Signature $s) => $s->getAppraisal()->getId(), $signatures);
        $disputedAppraisals = $this->appraisals->findDisputedByCycleExcludingIds($cycle, $excludedIds);
        foreach ($disputedAppraisals as $appraisal) {
            $rows[] = $this->rowFromAppraisal($appraisal);
        }

        // Compare the raw DateTimeImmutable (not the formatted string)
        // so ordering is correct regardless of timezone-offset formatting.
        usort($rows, static function (array $a, array $b): int {
            if ($a['signed_at'] === null && $b['signed_at'] === null) {
                return 0;
            }
            if ($a['signed_at'] === null) {
                return 1;
            }
            if ($b['signed_at'] === null) {
                return -1;
            }

            return $b['signed_at'] <=> $a['signed_at'];
        });

        return [
            'cycle_id' => (string) $cycle->getId(),
            'count' => count($rows),
            'disputes' => array_map(fn (array $row) => [
                ...$row,
                'signed_at' => $row['signed_at']?->format(\DateTimeInterface::ATOM),
            ], $rows),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function rowFromSignature(Signature $signature): array
    {
        $appraisal = $signature->getAppraisal();
        $employee = $appraisal->getEmployee();

        return [
            'appraisal_id' => (string) $appraisal->getId(),
            'employee_name' => $employee->getName(),
            'department_name' => $employee->getDepartment()->getName(),
            'cycle_name' => $appraisal->getCycle()->getPeriodName(),
            'signed_at' => $signature->getSignedAt(),
            'signature_action' => $signature->getAction()->value,
            'rejection_reason' => $signature->getReason(),
            'signer_role' => $signature->getSignerRole()->value,
            'resolution_status' => $appraisal->getStatus()->value,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function rowFromAppraisal(Appraisal $appraisal): array
    {
        $employee = $appraisal->getEmployee();

        return [
            'appraisal_id' => (string) $appraisal->getId(),
            'employee_name' => $employee->getName(),
            'department_name' => $employee->getDepartment()->getName(),
            'cycle_name' => $appraisal->getCycle()->getPeriodName(),
            'signed_at' => null,
            'signature_action' => null,
            'rejection_reason' => null,
            'signer_role' => null,
            'resolution_status' => $appraisal->getStatus()->value,
        ];
    }
}
