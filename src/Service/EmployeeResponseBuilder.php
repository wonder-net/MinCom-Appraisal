<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Employee;
use Symfony\Component\Asset\Packages;

/**
 * Port of apps.employees.serializers.{EmployeeListSerializer,
 * EmployeeDetailSerializer, DepartmentSerializer, UserDetailNestedSerializer}.
 */
final class EmployeeResponseBuilder
{
    public function __construct(
        private readonly Packages $assetPackages,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function buildList(Employee $employee): array
    {
        return [
            'id' => (string) $employee->getId(),
            'employee_number' => $employee->getEmployeeNumber(),
            'name' => $employee->getName(),
            'job_title' => $employee->getJobTitle(),
            'department' => (string) $employee->getDepartment()->getId(),
            'department_name' => $employee->getDepartment()->getName(),
            // "Directorate / Department" display label (HR change
            // request #6) — additive alongside department_name so
            // existing consumers of that field are unaffected.
            'department_full_label' => $employee->getDepartment()->getFullLabel(),
            'location' => $employee->getLocation(),
            'classification' => $employee->getClassification()->value,
            'classification_display' => $employee->getClassification()->label(),
            'photo_url' => $this->photoUrl($employee),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function buildDetail(Employee $employee, bool $includeUserDetail): array
    {
        $manager = $employee->getManager();
        $matrixAppraiser = $employee->getMatrixAppraiser();
        $department = $employee->getDepartment();

        $data = [
            'id' => (string) $employee->getId(),
            'user' => (string) $employee->getUser()->getId(),
            'employee_number' => $employee->getEmployeeNumber(),
            'name' => $employee->getName(),
            'job_title' => $employee->getJobTitle(),
            'department' => (string) $department->getId(),
            'department_detail' => [
                'id' => (string) $department->getId(),
                'name' => $department->getName(),
                'code' => $department->getCode(),
                'parent' => $department->getParent() !== null ? (string) $department->getParent()->getId() : null,
                'full_label' => $department->getFullLabel(),
                'created_at' => $department->getCreatedAt()->format(\DateTimeInterface::ATOM),
                'updated_at' => $department->getUpdatedAt()->format(\DateTimeInterface::ATOM),
            ],
            'department_full_label' => $department->getFullLabel(),
            'job_family' => $employee->getJobFamily(),
            'location' => $employee->getLocation(),
            'classification' => $employee->getClassification()->value,
            'classification_display' => $employee->getClassification()->label(),
            'manager' => $manager !== null ? (string) $manager->getId() : null,
            'manager_name' => $manager?->getName(),
            // HR change request #3 ("Matrix Structure / 2 Reporting
            // Lines"): optional second appraiser.
            'matrix_appraiser' => $matrixAppraiser !== null ? (string) $matrixAppraiser->getId() : null,
            'matrix_appraiser_name' => $matrixAppraiser?->getName(),
            'photo_url' => $this->photoUrl($employee),
            'is_active' => $employee->isActive(),
            'created_at' => $employee->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'updated_at' => $employee->getUpdatedAt()->format(\DateTimeInterface::ATOM),
        ];

        // PII (email, account status, roles, MFA status) — admin-tier only,
        // mirrors EmployeeDetailSerializer.to_representation()'s pop().
        if ($includeUserDetail) {
            $user = $employee->getUser();
            $data['user_detail'] = [
                'email' => $user->getEmail(),
                'is_active' => $user->isActive(),
                'roles' => array_map(static fn ($name) => $name->value, $user->getRoleNames()),
                'is_mfa_enabled' => $user->isMfaEnabled(),
            ];
        }

        return $data;
    }

    /**
     * Public URL for the employee's profile picture (HR change request
     * #2), matching the `basePath` configured on EmployeeCrudController's
     * ImageField (`public/uploads/employee-photos`, served from
     * `/uploads/employee-photos/...`). Null when no photo is set.
     *
     * Built via Packages::getUrl() (the same asset-path resolution Twig's
     * `asset()` uses) rather than a hardcoded `/uploads/...` string — this
     * app is served off-root behind an Apache Alias
     * (`/MinCom-Appraisal/`), so a bare root-relative path 404s; Packages
     * derives the correct prefix from the request context. The filename
     * itself is rawurlencode()'d separately — Packages::getUrl() does NOT
     * encode its input, and EasyAdmin's ImageField keeps the original
     * uploaded filename verbatim (which may contain spaces).
     */
    private function photoUrl(Employee $employee): ?string
    {
        $filename = $employee->getPhotoFilename();

        return $filename !== null ? $this->assetPackages->getUrl('uploads/employee-photos/'.rawurlencode($filename)) : null;
    }
}
