<?php

declare(strict_types=1);

namespace App\Security\Voter;

use App\Entity\User;
use App\Enum\RoleName;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Authorization\Voter\Voter;

/**
 * The RBAC primitives app ports build their authorization on. Started
 * with just IS_ADMIN (mirrors utils.permissions.IsHRAdmin — HR_ADMIN or
 * SYSTEM_ADMIN, sharing one permission surface, see
 * [[User::hasAdminRole]]). The `reports` app is the first to need
 * broader composites, so it adds:
 * - IS_HR_STAFF: mirrors utils.permissions.IsHRStaff (admin tier OR
 *   HR_OFFICER).
 * - IS_HR_STAFF_OR_EXECUTIVE: mirrors utils.permissions.IsHRStaffOrExecutive
 *   (admin tier OR HR_OFFICER OR EXECUTIVE). Django additionally
 *   restricts HR_OFFICER/EXECUTIVE to safe HTTP methods, but every
 *   reports endpoint using this attribute is GET-only, so that method
 *   check has no observable effect here and is omitted.
 */
final class RoleHierarchyVoter extends Voter
{
    public const IS_ADMIN = 'IS_ADMIN';
    public const IS_HR_STAFF = 'IS_HR_STAFF';
    public const IS_HR_STAFF_OR_EXECUTIVE = 'IS_HR_STAFF_OR_EXECUTIVE';

    protected function supports(string $attribute, mixed $subject): bool
    {
        return in_array($attribute, [self::IS_ADMIN, self::IS_HR_STAFF, self::IS_HR_STAFF_OR_EXECUTIVE], true);
    }

    protected function voteOnAttribute(string $attribute, mixed $subject, TokenInterface $token): bool
    {
        $user = $token->getUser();
        if (!$user instanceof User) {
            return false;
        }

        return match ($attribute) {
            self::IS_ADMIN => $user->hasAdminRole(),
            self::IS_HR_STAFF => $user->hasAdminRole() || $user->hasRole(RoleName::HR_OFFICER),
            self::IS_HR_STAFF_OR_EXECUTIVE => $user->hasAdminRole() || $user->hasRole(RoleName::HR_OFFICER) || $user->hasRole(RoleName::EXECUTIVE),
            default => false,
        };
    }
}
