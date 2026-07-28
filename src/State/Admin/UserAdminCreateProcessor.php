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
use App\Entity\User;
use App\Enum\EmployeeClassification;
use App\Enum\RoleName;
use App\Exception\BadRequestException;
use App\Exception\ConflictException;
use App\Repository\DepartmentRepository;
use App\Repository\EmployeeRepository;
use App\Repository\RoleRepository;
use App\Repository\UserRepository;
use App\Service\DepartmentService;
use App\Service\EmailService;
use App\Service\EmployeeNumberNormalizer;
use App\Service\TempPasswordGenerator;
use App\Validation\ValidationErrorFactory;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Uid\Uuid;

/**
 * Port of AdminUserListCreateView.post(), including
 * AdminUserCreateSerializer's optional employee-profile fields
 * (employee_number/job_title/job_family/department_id|department_name/
 * location/classification/manager_id): providing employee_number
 * triggers creation of a linked Employee profile alongside the User, in
 * the same transaction, exactly mirroring Django. Audit logging
 * (Django's `admin.user.created` audit_log_action call) is not ported —
 * no ApiResource Processor in this codebase currently has access to the
 * acting user/request, unlike the plain controllers AuditService::log()
 * is wired into elsewhere; a distinct, still-open gap, not silently
 * folded into this change.
 */
final class UserAdminCreateProcessor implements ProcessorInterface
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly RoleRepository $roles,
        private readonly EmployeeRepository $employees,
        private readonly DepartmentRepository $departmentRepository,
        private readonly DepartmentService $departments,
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly TempPasswordGenerator $tempPasswordGenerator,
        private readonly UserAdminResourceFactory $resourceFactory,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
        private readonly EmailService $emailService,
        private readonly string $frontendUrl,
    ) {
    }

    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): UserAdminResource
    {
        \assert($data instanceof UserAdminResource);

        $errors = [];

        if ($data->email === null || trim($data->email) === '') {
            $errors['email'] = 'This field is required.';
        } elseif (filter_var($data->email, \FILTER_VALIDATE_EMAIL) === false) {
            $errors['email'] = 'Enter a valid email address.';
        }

        if ($data->fullName === null || trim($data->fullName) === '') {
            $errors['full_name'] = 'This field is required.';
        }

        if ($data->roles === null || count($data->roles) === 0) {
            $errors['roles'] = 'This field is required.';
        } else {
            foreach ($data->roles as $roleValue) {
                if (RoleName::tryFrom($roleValue) === null) {
                    $errors['roles'] = sprintf('"%s" is not a valid choice.', $roleValue);
                    break;
                }
            }
        }

        $hasEmployeeNumber = $data->employeeNumber !== null && trim($data->employeeNumber) !== '';
        $classification = null;
        if ($hasEmployeeNumber) {
            if ($data->jobTitle === null || trim($data->jobTitle) === '') {
                $errors['job_title'] = 'This field is required when employee_number is provided.';
            }
            if ($data->classification === null || trim($data->classification) === '') {
                $errors['classification'] = 'This field is required when employee_number is provided.';
            } else {
                $classification = EmployeeClassification::tryFrom($data->classification);
                if ($classification === null) {
                    $errors['classification'] = sprintf('"%s" is not a valid choice.', $data->classification);
                }
            }
            if (!$this->hasDepartmentReference($data)) {
                $errors['department_id'] = 'This field is required when employee_number is provided.';
            }
        }

        if ($errors !== []) {
            throw ValidationErrorFactory::fields($errors);
        }

        if ($this->users->findOneByEmailCaseInsensitive($data->email) !== null) {
            throw new ConflictException('A user with this email already exists.');
        }

        $normalizedEmployeeNumber = null;
        $department = null;
        $managerEmployee = null;

        if ($hasEmployeeNumber) {
            $normalizedEmployeeNumber = EmployeeNumberNormalizer::normalize($data->employeeNumber);
            if ($this->employees->findExistingEmployeeNumbers([$normalizedEmployeeNumber]) !== []) {
                throw new BadRequestException('Employee number already exists.');
            }

            $department = $this->resolveDepartment($data);
            $managerEmployee = $this->resolveManager($data->managerId);
        }

        $tempPassword = $this->tempPasswordGenerator->generate();

        $user = new User(strtolower($data->email));
        $user->setPassword($this->passwordHasher->hashPassword($user, $tempPassword));
        $user->setFullName($data->fullName);

        foreach ($data->roles as $roleValue) {
            $user->addRole($this->resolveRole(RoleName::from($roleValue)));
        }

        $this->em->persist($user);

        if ($hasEmployeeNumber) {
            \assert($department instanceof Department && $classification instanceof EmployeeClassification && $normalizedEmployeeNumber !== null);
            $employee = new Employee($user, $normalizedEmployeeNumber, $data->fullName, $data->jobTitle, $department, $classification);
            if ($data->jobFamily !== null) {
                $employee->setJobFamily($data->jobFamily);
            }
            if ($data->location !== null) {
                $employee->setLocation($data->location);
            }
            if ($managerEmployee !== null) {
                $employee->setManager($managerEmployee);
            }
            $this->em->persist($employee);
        }

        $this->em->flush();

        $loginUrl = rtrim($this->frontendUrl, '/').'/login';
        $this->emailService->sendWelcomeAccount($user->getEmail(), $data->fullName, $tempPassword, $loginUrl);
        $this->logger->info('Admin user created [user_id={id}]', ['id' => (string) $user->getId()]);

        return $this->resourceFactory->fromEntity($user);
    }

    private function hasDepartmentReference(UserAdminResource $data): bool
    {
        return ($data->departmentId !== null && trim($data->departmentId) !== '')
            || ($data->departmentName !== null && trim($data->departmentName) !== '');
    }

    private function resolveDepartment(UserAdminResource $data): Department
    {
        if ($data->departmentId !== null && trim($data->departmentId) !== '') {
            $department = Uuid::isValid($data->departmentId) ? $this->departmentRepository->find($data->departmentId) : null;
            if ($department === null) {
                throw new BadRequestException(sprintf("Department with id '%s' does not exist.", $data->departmentId));
            }

            return $department;
        }

        \assert($data->departmentName !== null);

        return $this->departments->getOrCreateByName($data->departmentName);
    }

    private function resolveManager(?string $managerId): ?Employee
    {
        if ($managerId === null || trim($managerId) === '') {
            return null;
        }

        $manager = $this->employees->findActiveById($managerId);
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
