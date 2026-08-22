<?php

declare(strict_types=1);

namespace App\Factory;

use App\Entity\SubCompetency;
use Zenstruck\Foundry\Persistence\PersistentObjectFactory;

/**
 * @extends PersistentObjectFactory<SubCompetency>
 */
final class SubCompetencyFactory extends PersistentObjectFactory
{
    public static function class(): string
    {
        return SubCompetency::class;
    }

    protected function defaults(): array|callable
    {
        return [
            'competency' => CompetencyFactory::new(),
            'name' => self::faker()->unique()->words(2, true),
            'sortOrder' => self::faker()->unique()->numberBetween(1000, 9999),
        ];
    }

    public function inactive(): static
    {
        return $this->afterInstantiate(static function (SubCompetency $subCompetency): void {
            $subCompetency->setIsActive(false);
        });
    }
}
