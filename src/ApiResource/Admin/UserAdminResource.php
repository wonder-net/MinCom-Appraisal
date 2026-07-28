<?php

declare(strict_types=1);

namespace App\ApiResource\Admin;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use App\Security\Voter\RoleHierarchyVoter;
use App\State\Admin\UserAdminCollectionProvider;
use App\State\Admin\UserAdminCreateProcessor;
use App\State\Admin\UserAdminItemProvider;
use App\State\Admin\UserAdminUpdateProcessor;
use Symfony\Component\Serializer\Attribute\SerializedName;

/**
 * Port of apps.accounts.serializers.{AdminUserListSerializer,
 * AdminUserCreateSerializer, AdminUserUpdateSerializer} as a single
 * ApiResource DTO. Every property is nullable and used for both reading
 * (GetCollection) and writing (Post/Patch) — there's no separate input/
 * output class because none of the write-able fields (full_name, roles,
 * is_active) are ever legitimately `null` in a real request, so `null`
 * unambiguously means "not provided" on Patch's partial-update semantics.
 *
 * employee_* fields double as both the read-only projection of the
 * linked Employee profile (see UserAdminResourceFactory; null when no
 * profile is linked) AND the writable employee-profile-provisioning
 * fields accepted by Django's AdminUserCreateSerializer/
 * AdminUserUpdateSerializer: providing `employee_number` on Post
 * creates a linked Employee profile alongside the User; providing any
 * of them on Patch updates the existing profile (a profile is never
 * created via Patch — see UserAdminUpdateProcessor). Patch's
 * employee-field presence is determined from the raw request body, not
 * this DTO's properties — see UserAdminUpdateProcessor's docblock for
 * why (OBJECT_TO_POPULATE pre-fills every property from current state).
 */
#[ApiResource(
    shortName: 'AdminUser',
    operations: [
        new GetCollection(
            uriTemplate: '/admin/users/',
            security: "is_granted('".RoleHierarchyVoter::IS_ADMIN."')",
            provider: UserAdminCollectionProvider::class,
            paginationEnabled: false,
        ),
        new Post(
            uriTemplate: '/admin/users/',
            status: 201,
            security: "is_granted('".RoleHierarchyVoter::IS_ADMIN."')",
            processor: UserAdminCreateProcessor::class,
        ),
        new Patch(
            uriTemplate: '/admin/users/{id}/',
            security: "is_granted('".RoleHierarchyVoter::IS_ADMIN."')",
            provider: UserAdminItemProvider::class,
            processor: UserAdminUpdateProcessor::class,
        ),
    ],
)]
final class UserAdminResource
{
    public ?string $id = null;

    public ?string $email = null;

    #[SerializedName('full_name')]
    public ?string $fullName = null;

    /** @var list<string>|null */
    public ?array $roles = null;

    #[SerializedName('is_active')]
    public ?bool $isActive = null;

    #[SerializedName('mfa_enabled')]
    public ?bool $mfaEnabled = null;

    #[SerializedName('last_login')]
    public ?string $lastLogin = null;

    #[SerializedName('employee_id')]
    public ?string $employeeId = null;

    #[SerializedName('employee_name')]
    public ?string $employeeName = null;

    #[SerializedName('employee_number')]
    public ?string $employeeNumber = null;

    #[SerializedName('job_title')]
    public ?string $jobTitle = null;

    #[SerializedName('job_family')]
    public ?string $jobFamily = null;

    #[SerializedName('department_id')]
    public ?string $departmentId = null;

    #[SerializedName('department_name')]
    public ?string $departmentName = null;

    public ?string $location = null;

    public ?string $classification = null;

    #[SerializedName('manager_id')]
    public ?string $managerId = null;

    #[SerializedName('manager_name')]
    public ?string $managerName = null;

    #[SerializedName('must_change_password')]
    public ?bool $mustChangePassword = null;

    #[SerializedName('is_locked')]
    public ?bool $isLocked = null;
}
