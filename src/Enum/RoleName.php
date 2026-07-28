<?php

declare(strict_types=1);

namespace App\Enum;

/**
 * RBAC role names, ported from apps.accounts.models.RoleName.
 *
 * SYSTEM_ADMIN shares the same permission surface as HR_ADMIN — the
 * distinction is organisational (HR vs IT) and surfaces in user listings
 * and audit logs, not in permission checks (see User::hasAdminRole()).
 */
enum RoleName: string
{
    case EMPLOYEE = 'EMPLOYEE';
    case MANAGER = 'MANAGER';
    case HR_OFFICER = 'HR_OFFICER';
    case HR_ADMIN = 'HR_ADMIN';
    case EXECUTIVE = 'EXECUTIVE';
    case SYSTEM_ADMIN = 'SYSTEM_ADMIN';

    public function label(): string
    {
        return match ($this) {
            self::EMPLOYEE => 'Appraisee',
            self::MANAGER => 'Appraisor',
            self::HR_OFFICER => 'HR Director',
            self::HR_ADMIN => 'HR Admin',
            self::EXECUTIVE => 'Executive',
            self::SYSTEM_ADMIN => 'System Admin',
        };
    }
}
