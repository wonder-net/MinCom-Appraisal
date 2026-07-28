<?php

declare(strict_types=1);

namespace App\Factory;

use App\Entity\KeyDeliverable;
use Zenstruck\Foundry\Persistence\PersistentObjectFactory;

/**
 * @extends PersistentObjectFactory<KeyDeliverable>
 */
final class KeyDeliverableFactory extends PersistentObjectFactory
{
    public static function class(): string
    {
        return KeyDeliverable::class;
    }

    protected function defaults(): array|callable
    {
        return [
            'appraisal' => AppraisalFactory::new(),
            'perspective' => BscPerspectiveFactory::new(),
            'description' => self::faker()->sentence(),
            'weight' => '0.2500',
        ];
    }
}
