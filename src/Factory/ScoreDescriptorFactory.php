<?php

declare(strict_types=1);

namespace App\Factory;

use App\Entity\ScoreDescriptor;
use Zenstruck\Foundry\Persistence\PersistentObjectFactory;

/**
 * @extends PersistentObjectFactory<ScoreDescriptor>
 */
final class ScoreDescriptorFactory extends PersistentObjectFactory
{
    public static function class(): string
    {
        return ScoreDescriptor::class;
    }

    protected function defaults(): array|callable
    {
        return [
            'minScore' => '0.00',
            'maxScore' => '1.99',
            'kdLabel' => self::faker()->words(2, true),
            'competencyLabel' => self::faker()->words(2, true),
            'sortOrder' => self::faker()->unique()->numberBetween(1000, 9999),
            'cycle' => null,
        ];
    }
}
