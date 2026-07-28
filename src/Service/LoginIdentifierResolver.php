<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\User;
use App\Enum\IdentifierKind;
use App\Repository\EmployeeRepository;
use App\Repository\UserRepository;

/**
 * Port of apps.accounts.views._resolve_login_identifier / _classify_identifier.
 */
final class LoginIdentifierResolver
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly EmployeeRepository $employees,
    ) {
    }

    /**
     * @return array{0: ?User, 1: IdentifierKind}
     */
    public function resolve(string $identifier): array
    {
        if (!str_contains($identifier, '@')) {
            if (trim($identifier) === '') {
                return [null, IdentifierKind::NOT_FOUND];
            }

            $employee = $this->employees->findByEmployeeNumber($identifier);

            return $employee !== null ? [$employee->getUser(), IdentifierKind::EMPLOYEE_NUMBER] : [null, IdentifierKind::NOT_FOUND];
        }

        $user = $this->users->findOneByEmailCaseInsensitive($identifier);

        return $user !== null ? [$user, IdentifierKind::EMAIL] : [null, IdentifierKind::NOT_FOUND];
    }
}
