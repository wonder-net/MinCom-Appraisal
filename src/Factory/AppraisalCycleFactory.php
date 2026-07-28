<?php

declare(strict_types=1);

namespace App\Factory;

use App\Entity\AppraisalCycle;
use App\Enum\AppraisalCycleStatus;
use Zenstruck\Foundry\Persistence\PersistentObjectFactory;

/**
 * @extends PersistentObjectFactory<AppraisalCycle>
 */
final class AppraisalCycleFactory extends PersistentObjectFactory
{
    public static function class(): string
    {
        return AppraisalCycle::class;
    }

    protected function defaults(): array|callable
    {
        return [
            'periodName' => self::faker()->unique()->words(3, true).' Review',
            'startDate' => new \DateTimeImmutable('-30 days'),
            'endDate' => new \DateTimeImmutable('+30 days'),
            'createdBy' => UserFactory::new()->admin(),
            'selfRatingEnabled' => true,
        ];
    }

    public function active(): static
    {
        return $this->afterInstantiate(static function (AppraisalCycle $cycle): void {
            $cycle->setStatus(AppraisalCycleStatus::ACTIVE);
        });
    }

    public function closed(): static
    {
        return $this->afterInstantiate(static function (AppraisalCycle $cycle): void {
            $cycle->setStatus(AppraisalCycleStatus::CLOSED);
        });
    }
}
