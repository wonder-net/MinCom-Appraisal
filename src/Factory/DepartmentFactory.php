<?php

declare(strict_types=1);

namespace App\Factory;

use App\Entity\Department;
use App\Service\DepartmentService;
use Zenstruck\Foundry\Persistence\PersistentObjectFactory;

/**
 * @extends PersistentObjectFactory<Department>
 */
final class DepartmentFactory extends PersistentObjectFactory
{
    public function __construct(private readonly DepartmentService $departments)
    {
        parent::__construct();
    }

    public static function class(): string
    {
        return Department::class;
    }

    protected function defaults(): array|callable
    {
        $name = self::faker()->unique()->company();

        return [
            'name' => $name,
            'code' => $this->departments->generateCode($name).'-'.self::faker()->unique()->numberBetween(1000, 9999),
        ];
    }
}
