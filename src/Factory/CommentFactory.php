<?php

declare(strict_types=1);

namespace App\Factory;

use App\Entity\Comment;
use App\Enum\AppraisalPartyRole;
use Zenstruck\Foundry\Persistence\PersistentObjectFactory;

/**
 * @extends PersistentObjectFactory<Comment>
 */
final class CommentFactory extends PersistentObjectFactory
{
    public static function class(): string
    {
        return Comment::class;
    }

    protected function defaults(): array|callable
    {
        return [
            'appraisal' => AppraisalFactory::new(),
            'author' => UserFactory::new(),
            'authorRole' => AppraisalPartyRole::APPRAISEE,
            'content' => self::faker()->sentence(),
        ];
    }
}
