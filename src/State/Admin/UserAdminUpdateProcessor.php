<?php

declare(strict_types=1);

namespace App\State\Admin;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\ApiResource\Admin\UserAdminResource;
use App\ApiResource\Admin\UserAdminResourceFactory;
use App\Entity\Department;
use App\Entity\Employee;
use App\Entity\Role;
use App\Enum\EmployeeClassification;
use App\Enum\RoleName;
use App\Exception\BadRequestException;
use App\Repository\DepartmentRepository;
use App\Repository\EmployeeRepository;
use App\Repository\RoleRepository;
use App\Repository\UserRepository;
use App\Service\DepartmentService;
use App\Service\EmployeeNumberNormalizer;
use App\Service\TokenService;
use App\Validation\ValidationErrorFactory;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Uid\Uuid;

/**
 * Port of AdminUserUpdateView.patch(), including
 * AdminUserUpdateSerializer's employee-profile fields (employee_number/
 * job_title/job_family/department_id|department_name/location/
 * classification/manager_id): only applied when the user already has a
 * linked Employee profile — matching Django exactly, no profile is
 * created here (use POST for that). `email` is immutable and simply
 * isn't writable on this DTO (there's no code path that reads
 * $data->email here), matching Django's rejection of email changes.
 *
 * Employee-field presence is checked against the RAW decoded request
 * body, not `$data`'s properties: API Platform's Patch flow denormalizes
 * onto the object UserAdminItemProvider already populated from current
 * entity state (OBJECT_TO_POPULATE), so every property on `$data` — not
 * just the ones actually sent — starts pre-filled with the current
 * value. `$data->departmentId !== null` alone can't tell "client sent
 * department_id" apart from "client sent nothing and this is just the
 * employee's existing department" — the distinction matters because
 * department_id/department_name are mutually exclusive alternatives
 * (Django checks `"department_id" in attrs` at the serializer-field
 * level, which has no such pre-population step) and because
 * manager_id must support an explicit `null` to clear an existing
 * manager (see AdminUserUpdateSerializer's `allow_null=True`), which is
 * indistinguishable from "not sent" once merged onto a pre-populated
 * object. roles/is_active/full_name don't need this treatment: reapplying
 * their already-current pre-populated value when the client didn't
 * touch them is a harmless no-op, not a wrong-branch bug.
 *
 * Audit logging is not ported — see UserAdminCreateProcessor's docblock
 * for why.
 */
final class UserAdminUpdateProcessor implements ProcessorInterface
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly RoleRepository $roles,
        private readonly EmployeeRepository $employees,
        private readonly DepartmentRepository $departmentRepository,
        private readonly DepartmentService $departments,
        private readonly TokenService $tokenService,
        private readonly UserAdminResourceFactory $resourceFactory,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): UserAdminResource
    {
        \assert($data instanceof UserAdminResource);

        $user = $this->users->find(Uuid::fromString((string) $uriVariables['id']));
        if ($user === null) {
            // Defensive: UserAdminItemProvider already 404s before we get here.
            throw new NotFoundHttpException();
        }

        /** @var Request $request */
        $request = $context['request'];
        $rawBody = json_decode($request->getContent(), true);
        $rawBody = is_array($rawBody) ? $rawBody : [];

        if ($data->roles !== null) {
            if (count($data->roles) === 0) {
                throw ValidationErrorFactory::field('roles', 'This list may not be empty.');
            }

            foreach ($data->roles as $roleValue) {
                if (RoleName::tryFrom($roleValue) === null) {
                    throw ValidationErrorFactory::field('roles', sprintf('"%s" is not a valid choice.', $roleValue));
                }
            }
        }

        $employee = $this->employees->findByUser($user);

        $employeeNumberProvided = $employee !== null && array_key_exists('employee_number', $rawBody);
        $normalizedEmployeeNumber = null;
        if ($employeeNumberProvided) {
            $normalizedEmployeeNumber = EmployeeNumberNormalizer::normalize((string) $rawBody['employee_number']);
            if ($this->employees->existsByEmployeeNumberExcluding($normalizedEmployeeNumber, $employee->getId())) {
                throw new BadRequestException('Employee number already exists.');
            }
        }

        $department = null;
        if ($employee !== null && (array_key_exists('department_id', $rawBody) || array_key_exists('department_name', $rawBody))) {
            $department = $this->resolveDepartment($rawBody);
        }

        $classificationProvided = $employee !== null && array_key_exists('classification', $rawBody);
        $classification = null;
        if ($classificationProvided) {
            $classification = EmployeeClassification::tryFrom((string) $rawBody['classification']);
            if ($classification === null) {
                throw ValidationErrorFactory::field('classification', sprintf('"%s" is not a valid choice.', $rawBody['classification']));
            }
        }

        $managerProvided = $employee !== null && array_key_exists('manager_id', $rawBody);
        $managerEmployee = $managerProvided ? $this->resolveManager($rawBody['manager_id']) : null;

        $jobTitleProvided = $employee !== null && array_key_exists('job_title', $rawBody);
        $jobFamilyProvided = $employee !== null && array_key_exists('job_family', $rawBody);
        $locationProvided = $employee !== null && array_key_exists('location', $rawBody);

        if ($data->roles !== null) {
            foreach ($user->getAssignedRoles()->toArray() as $existingRole) {
                $user->removeRole($existingRole);
            }
            foreach ($data->roles as $roleValue) {
                $user->addRole($this->resolveRole(RoleName::from($roleValue)));
            }
        }

        $wasActive = $user->isActive();
        if ($data->isActive !== null) {
            $user->setIsActive($data->isActive);
        }

        if ($data->fullName !== null) {
            $user->setFullName($data->fullName);
            // Employee.name is the canonical display name when a profile
            // exists — Django updates both columns on this same write.
            $employee?->setName($data->fullName);
        }

        if ($employee !== null) {
            if ($normalizedEmployeeNumber !== null) {
                $employee->setEmployeeNumber($normalizedEmployeeNumber);
            }
            if ($jobTitleProvided) {
                $employee->setJobTitle((string) $rawBody['job_title']);
            }
            if ($jobFamilyProvided) {
                $employee->setJobFamily((string) $rawBody['job_family']);
            }
            if ($department !== null) {
                $employee->setDepartment($department);
            }
            if ($locationProvided) {
                $employee->setLocation((string) $rawBody['location']);
            }
            if ($classification !== null) {
                $employee->setClassification($classification);
            }
            if ($managerProvided) {
                $employee->setManager($managerEmployee);
            }
        }

        $this->em->flush();

        if ($data->isActive !== null && $wasActive && !$data->isActive) {
            $this->tokenService->revokeAllForUser($user);
        }

        $this->logger->info('Admin user updated [user_id={id}]', ['id' => (string) $user->getId()]);

        return $this->resourceFactory->fromEntity($user);
    }

    /**
     * @param array<string, mixed> $rawBody
     */
    private function resolveDepartment(array $rawBody): Department
    {
        $departmentId = $rawBody['department_id'] ?? null;
        if ($departmentId !== null && trim((string) $departmentId) !== '') {
            $department = Uuid::isValid((string) $departmentId) ? $this->departmentRepository->find((string) $departmentId) : null;
            if ($department === null) {
                throw new BadRequestException(sprintf("Department with id '%s' does not exist.", $departmentId));
            }

            return $department;
        }

        $departmentName = $rawBody['department_name'] ?? null;
        if ($departmentName !== null && trim((string) $departmentName) !== '') {
            return $this->departments->getOrCreateByName((string) $departmentName);
        }

        throw new BadRequestException('Either department_id or department_name is required.');
    }

    private function resolveManager(mixed $managerId): ?Employee
    {
        if ($managerId === null || trim((string) $managerId) === '') {
            return null;
        }

        $manager = $this->employees->findActiveById((string) $managerId);
        if ($manager === null) {
            throw new BadRequestException(sprintf("Employee (manager) with id '%s' does not exist.", $managerId));
        }

        return $manager;
    }

    private function resolveRole(RoleName $name): Role
    {
        $role = $this->roles->findByName($name);
        if ($role !== null) {
            return $role;
        }

        $role = new Role($name);
        $this->em->persist($role);

        return $role;
    }
}
