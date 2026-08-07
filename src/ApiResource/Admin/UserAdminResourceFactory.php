<?php

declare(strict_types=1);

namespace App\ApiResource\Admin;

use App\Entity\User;
use App\Repository\EmployeeRepository;
use App\Service\BruteForceProtectionService;

/**
 * Entity -> ApiResource DTO mapping, kept out of the Provider classes so
 * both the collection and item providers share one implementation.
 */
final class UserAdminResourceFactory
{
    public function __construct(
        private readonly BruteForceProtectionService $bruteForce,
        private readonly EmployeeRepository $employees,
    ) {
    }

    public function fromEntity(User $user): UserAdminResource
    {
        $employee = $this->employees->findByUser($user);

        $resource = new UserAdminResource();
        $resource->id = (string) $user->getId();
        $resource->email = $user->getEmail();
        $resource->fullName = $employee !== null ? $employee->getName() : ($user->getFullName() ?? '');
        $resource->roles = array_map(static fn ($name) => $name->value, $user->getRoleNames());
        $resource->isActive = $user->isActive();
        $resource->mfaEnabled = $user->isMfaEnabled();
        $resource->lastLogin = $user->getLastLogin()?->format(\DateTimeInterface::ATOM);
        $resource->mustChangePassword = $user->getLastPasswordChange() === null;
        [$isLocked] = $this->bruteForce->checkLockout($user);
        $resource->isLocked = $isLocked;

        if ($employee !== null) {
            $manager = $employee->getManager();
            $matrixAppraiser = $employee->getMatrixAppraiser();
            $resource->employeeId = (string) $employee->getId();
            $resource->employeeName = $employee->getName();
            $resource->employeeNumber = $employee->getEmployeeNumber();
            $resource->jobTitle = $employee->getJobTitle();
            $resource->jobFamily = $employee->getJobFamily();
            $resource->departmentId = (string) $employee->getDepartment()->getId();
            $resource->departmentName = $employee->getDepartment()->getName();
            $resource->location = $employee->getLocation();
            $resource->classification = $employee->getClassification()->value;
            $resource->managerId = $manager !== null ? (string) $manager->getId() : null;
            $resource->managerName = $manager?->getName();
            $resource->matrixAppraiserId = $matrixAppraiser !== null ? (string) $matrixAppraiser->getId() : null;
            $resource->matrixAppraiserName = $matrixAppraiser?->getName();
        }

        return $resource;
    }
}
