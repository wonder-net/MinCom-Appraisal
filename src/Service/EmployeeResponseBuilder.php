<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Employee;

/**
 * Port of apps.employees.serializers.{EmployeeListSerializer,
 * EmployeeDetailSerializer, DepartmentSerializer, UserDetailNestedSerializer}.
 */
final class EmployeeResponseBuilder
{
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
            'location' => $employee->getLocation(),
            'classification' => $employee->getClassification()->value,
            'classification_display' => $employee->getClassification()->label(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function buildDetail(Employee $employee, bool $includeUserDetail): array
    {
        $manager = $employee->getManager();
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
                'created_at' => $department->getCreatedAt()->format(\DateTimeInterface::ATOM),
                'updated_at' => $department->getUpdatedAt()->format(\DateTimeInterface::ATOM),
            ],
            'job_family' => $employee->getJobFamily(),
            'location' => $employee->getLocation(),
            'classification' => $employee->getClassification()->value,
            'classification_display' => $employee->getClassification()->label(),
            'manager' => $manager !== null ? (string) $manager->getId() : null,
            'manager_name' => $manager?->getName(),
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
}
