<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Appraisal;
use App\Entity\Employee;
use App\Entity\Signature;
use App\Repository\SignatureRepository;
use Symfony\Component\Asset\Packages;

/**
 * Port of apps.appraisals.serializers.{AppraisalSerializer,
 * AppraisalListSerializer, AppraisalDetailSerializer}.
 */
final class AppraisalResponseBuilder
{
    public function __construct(
        private readonly SignatureRepository $signatures,
        private readonly SignatureResponseBuilder $signatureResponseBuilder,
        private readonly Packages $assetPackages,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function buildList(Appraisal $appraisal): array
    {
        $employee = $appraisal->getEmployee();

        return [
            'id' => (string) $appraisal->getId(),
            'cycle_id' => (string) $appraisal->getCycle()->getId(),
            'cycle_period_name' => $appraisal->getCycle()->getPeriodName(),
            'employee_id' => (string) $employee->getId(),
            'employee_name' => $employee->getName(),
            'employee_job_title' => $employee->getJobTitle(),
            'department' => $this->departmentName($appraisal),
            // HR change request #6 — additive alongside `department` so
            // existing consumers of that field are unaffected.
            'department_full_label' => $employee->getDepartment()->getFullLabel(),
            'self_rating_enabled' => $appraisal->getCycle()->isSelfRatingEnabled(),
            'form_type' => $appraisal->getFormType()->value,
            'status' => $appraisal->getStatus()->value,
            'status_changed_at' => $appraisal->getStatusChangedAt()?->format(\DateTimeInterface::ATOM),
            'total_score' => $appraisal->getTotalScore(),
            'performance_descriptor' => $appraisal->getPerformanceDescriptor(),
            'escalated_executive' => $this->escalatedExecutiveId($appraisal),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function buildDetail(Appraisal $appraisal): array
    {
        $employee = $appraisal->getEmployee();
        $manager = $employee->getManager();

        return [
            'id' => (string) $appraisal->getId(),
            'cycle_id' => (string) $appraisal->getCycle()->getId(),
            'cycle_period_name' => $appraisal->getCycle()->getPeriodName(),
            'employee_id' => (string) $employee->getId(),
            'employee_name' => $employee->getName(),
            'employee_number' => $employee->getEmployeeNumber(),
            'employee_job_title' => $employee->getJobTitle(),
            'appraiser_id' => $manager !== null ? (string) $manager->getId() : null,
            'department' => $this->departmentName($appraisal),
            // HR change requests #6 (Directorate/Department) and #2
            // (employee photo) — additive fields for the SPA's appraisal
            // header, same data EmployeeResponseBuilder/EmployeePhotoLoader
            // already expose elsewhere.
            'department_full_label' => $employee->getDepartment()->getFullLabel(),
            'employee_photo_url' => $this->employeePhotoUrl($employee),
            'self_rating_enabled' => $appraisal->getCycle()->isSelfRatingEnabled(),
            'form_type' => $appraisal->getFormType()->value,
            'status' => $appraisal->getStatus()->value,
            'status_changed_at' => $appraisal->getStatusChangedAt()?->format(\DateTimeInterface::ATOM),
            'total_score' => $appraisal->getTotalScore(),
            'performance_descriptor' => $appraisal->getPerformanceDescriptor(),
            'kd_average_score' => $appraisal->getKdAverageScore(),
            'kd_descriptor' => $appraisal->getKdDescriptor(),
            'bc_average_score' => $appraisal->getBcAverageScore(),
            'bc_descriptor' => $appraisal->getBcDescriptor(),
            'version' => $appraisal->getVersion(),
            'signing_round' => $appraisal->getSigningRound(),
            'escalated_executive' => $this->escalatedExecutiveId($appraisal),
            'escalation_reason' => $appraisal->getEscalationReason(),
            'created_at' => $appraisal->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'updated_at' => $appraisal->getUpdatedAt()->format(\DateTimeInterface::ATOM),
            'signatures' => array_map(
                fn (Signature $s) => $this->signatureResponseBuilder->build($s),
                $this->signatures->findByAppraisalOrderedBySignedAt($appraisal),
            ),
        ];
    }

    /**
     * Port of apps.appraisals.serializers.AppraisalSerializer — the
     * plain "every field read-only" shape used by the transition,
     * exclude, and re-include endpoints (as opposed to the list/detail
     * serializers, which flatten and denormalise employee/cycle fields).
     *
     * @return array<string, mixed>
     */
    public function buildPlain(Appraisal $appraisal): array
    {
        return [
            'id' => (string) $appraisal->getId(),
            'cycle' => (string) $appraisal->getCycle()->getId(),
            'employee' => (string) $appraisal->getEmployee()->getId(),
            'form_type' => $appraisal->getFormType()->value,
            'status' => $appraisal->getStatus()->value,
            'status_changed_at' => $appraisal->getStatusChangedAt()?->format(\DateTimeInterface::ATOM),
            'previous_status' => $appraisal->getPreviousStatus()?->value,
            'kd_average_score' => $appraisal->getKdAverageScore(),
            'bc_average_score' => $appraisal->getBcAverageScore(),
            'total_score' => $appraisal->getTotalScore(),
            'kd_descriptor' => $appraisal->getKdDescriptor(),
            'bc_descriptor' => $appraisal->getBcDescriptor(),
            'performance_descriptor' => $appraisal->getPerformanceDescriptor(),
            'version' => $appraisal->getVersion(),
            'signing_round' => $appraisal->getSigningRound(),
            'escalated_executive' => $this->escalatedExecutiveId($appraisal),
            'escalation_reason' => $appraisal->getEscalationReason(),
            'created_at' => $appraisal->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'updated_at' => $appraisal->getUpdatedAt()->format(\DateTimeInterface::ATOM),
        ];
    }

    private function departmentName(Appraisal $appraisal): string
    {
        $department = $appraisal->getEmployee()->getDepartment();

        return $department->getName();
    }

    private function escalatedExecutiveId(Appraisal $appraisal): ?string
    {
        $executive = $appraisal->getEscalatedExecutive();

        return $executive !== null ? (string) $executive->getId() : null;
    }

    /**
     * Mirrors EmployeeResponseBuilder::photoUrl() (see its docblock for
     * why Packages::getUrl() + rawurlencode() rather than a hardcoded
     * `/uploads/...` string) — kept as its own tiny duplicate rather than
     * a shared dependency, since this class doesn't otherwise need
     * EmployeeResponseBuilder and the logic is one line.
     */
    private function employeePhotoUrl(Employee $employee): ?string
    {
        $filename = $employee->getPhotoFilename();

        return $filename !== null ? $this->assetPackages->getUrl('uploads/employee-photos/'.rawurlencode($filename)) : null;
    }
}
