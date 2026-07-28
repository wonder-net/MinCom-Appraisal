<?php

declare(strict_types=1);

namespace App\Factory;

use App\Entity\User;
use App\Enum\RoleName;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Zenstruck\Foundry\Persistence\PersistentObjectFactory;

/**
 * @extends PersistentObjectFactory<User>
 */
final class UserFactory extends PersistentObjectFactory
{
    public const DEFAULT_PASSWORD = 'Foundry-Test-Pass1!';

    public function __construct(private readonly UserPasswordHasherInterface $passwordHasher)
    {
        parent::__construct();
    }

    public static function class(): string
    {
        return User::class;
    }

    protected function defaults(): array|callable
    {
        return [
            'email' => self::faker()->unique()->safeEmail(),
        ];
    }

    protected function initialize(): static
    {
        return $this->afterInstantiate(function (User $user): void {
            $user->setPassword($this->passwordHasher->hashPassword($user, self::DEFAULT_PASSWORD));
        });
    }

    /**
     * Assigns roles by finding-or-creating the corresponding Role rows
     * (name is unique, so multiple users sharing a role must reuse one row).
     */
    public function withRoles(RoleName ...$names): static
    {
        return $this->afterInstantiate(function (User $user) use ($names): void {
            foreach ($names as $name) {
                $user->addRole(RoleFactory::findOrCreate(['name' => $name]));
            }
        });
    }

    public function admin(): static
    {
        return $this->withRoles(RoleName::HR_ADMIN);
    }

    public function inactive(): static
    {
        return $this->afterInstantiate(static function (User $user): void {
            $user->deactivate();
        });
    }
}
