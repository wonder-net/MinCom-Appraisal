<?php

declare(strict_types=1);

namespace App\Factory;

use App\Entity\BscPerspective;
use Zenstruck\Foundry\Persistence\PersistentObjectFactory;

/**
 * @extends PersistentObjectFactory<BscPerspective>
 */
final class BscPerspectiveFactory extends PersistentObjectFactory
{
    public static function class(): string
    {
        return BscPerspective::class;
    }

    protected function defaults(): array|callable
    {
        return [
            'name' => self::faker()->unique()->words(2, true),
            'sortOrder' => self::faker()->unique()->numberBetween(1000, 9999),
        ];
    }
}
