<?php

declare(strict_types=1);

namespace App\Factory;

use App\Entity\Role;
use App\Enum\RoleName;
use Zenstruck\Foundry\Persistence\PersistentObjectFactory;

/**
 * @extends PersistentObjectFactory<Role>
 */
final class RoleFactory extends PersistentObjectFactory
{
    public static function class(): string
    {
        return Role::class;
    }

    protected function defaults(): array|callable
    {
        return [
            'name' => RoleName::EMPLOYEE,
        ];
    }
}
