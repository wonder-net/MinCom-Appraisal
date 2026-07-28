<?php

declare(strict_types=1);

namespace App\Factory;

use App\Entity\Competency;
use App\Enum\CompetencyApplicableTo;
use Zenstruck\Foundry\Persistence\PersistentObjectFactory;

/**
 * @extends PersistentObjectFactory<Competency>
 */
final class CompetencyFactory extends PersistentObjectFactory
{
    public static function class(): string
    {
        return Competency::class;
    }

    protected function defaults(): array|callable
    {
        return [
            'name' => self::faker()->unique()->words(3, true),
            'applicableTo' => CompetencyApplicableTo::ALL,
            'sortOrder' => self::faker()->unique()->numberBetween(1000, 9999),
            'isCore' => true,
        ];
    }

    public function inactive(): static
    {
        return $this->afterInstantiate(static function (Competency $competency): void {
            $competency->setIsActive(false);
        });
    }
}
