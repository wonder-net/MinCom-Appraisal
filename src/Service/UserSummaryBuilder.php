<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\User;
use App\Repository\EmployeeRepository;

/**
 * Builds the small `user` object embedded in login/MFA-verify-login
 * responses (LoginUserInfoSerializer in Django) — shared by LoginController
 * and MfaVerifyLoginController since both mint a brand new session and
 * return identical user-summary shapes.
 */
final class UserSummaryBuilder
{
    public function __construct(private readonly EmployeeRepository $employees)
    {
    }

    /**
     * @return array{id: string, email: string, roles: list<string>, is_mfa_enabled: bool, employee_id: string|null}
     */
    public function build(User $user): array
    {
        $employee = $this->employees->findByUser($user);

        return [
            'id' => (string) $user->getId(),
            'email' => $user->getEmail(),
            'roles' => array_map(static fn ($name) => $name->value, $user->getRoleNames()),
            'is_mfa_enabled' => $user->isMfaEnabled(),
            'employee_id' => $employee !== null ? (string) $employee->getId() : null,
        ];
    }
}
