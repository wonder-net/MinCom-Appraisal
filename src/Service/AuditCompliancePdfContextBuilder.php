<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Appraisal;
use App\Entity\AppraisalCycle;
use App\Entity\Signature;
use App\Entity\User;
use App\Repository\AppraisalRepository;
use App\Repository\EmployeeRepository;
use App\Repository\SignatureRepository;

/**
 * Port of apps.reports.views.{AuditCompliancePDFView, _build_appraisal_signoff_entry,
 * _build_compliance_summary}. Builds the Twig context for
 * pdf/audit_compliance_report.html.twig.
 */
final class AuditCompliancePdfContextBuilder
{
    private const DATE_FORMAT = 'd/m/Y H:i \U\T\C';

    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly SignatureRepository $signatures,
        private readonly EmployeeRepository $employees,
        private readonly PdfLogo $logo,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(AppraisalCycle $cycle, User $generatedByUser): array
    {
        $entries = array_map(
            fn (Appraisal $a) => $this->buildEntry($a),
            $this->appraisals->findByCycleOrderedByDepartmentAndEmployeeId($cycle),
        );

        $generatedByProfile = $this->employees->findByUser($generatedByUser);

        return [
            'cycle_name' => $cycle->getPeriodName(),
            'cycle_year' => (int) $cycle->getStartDate()->format('Y'),
            'generated_at' => (new \DateTimeImmutable())->format(self::DATE_FORMAT),
            'generated_by' => $generatedByProfile?->getName() ?: $generatedByUser->getEmail(),
            'appraisals' => $entries,
            'summary' => $this->buildSummary($entries),
            'logo_b64' => $this->logo->base64DataUri(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function buildEntry(Appraisal $appraisal): array
    {
        $employee = $appraisal->getEmployee();

        return [
            'employee_name' => $employee->getName(),
            'department_name' => $employee->getDepartment()->getName(),
            'status' => $appraisal->getStatus()->label(),
            'signatures' => array_map(
                fn (Signature $s) => $this->buildSignatureRow($s),
                $this->signatures->findByAppraisalOrderedBySignedAt($appraisal),
            ),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function buildSignatureRow(Signature $signature): array
    {
        $signerProfile = $this->employees->findByUser($signature->getSigner());

        return [
            'signer_name' => $signerProfile?->getName() ?? '',
            'signer_role' => $signature->getSignerRole()->label(),
            'action' => $signature->getAction()->label(),
            'reason' => $signature->getReason() ?? '',
            'signed_at' => $signature->getSignedAt()->format(self::DATE_FORMAT),
            'ip_address' => $signature->getIpAddress(),
        ];
    }

    /**
     * @param list<array<string, mixed>> $entries
     * @return array<string, mixed>
     */
    private function buildSummary(array $entries): array
    {
        $statusCounts = [];
        $disputeCount = 0;
        foreach ($entries as $entry) {
            $status = $entry['status'];
            $statusCounts[$status] = ($statusCounts[$status] ?? 0) + 1;
            if ($status === 'Disputed') {
                ++$disputeCount;
            }
        }

        ksort($statusCounts);

        return [
            'total_count' => count($entries),
            'by_status' => array_map(static fn (string $status, int $count) => ['status' => $status, 'count' => $count], array_keys($statusCounts), $statusCounts),
            'dispute_count' => $disputeCount,
        ];
    }
}
