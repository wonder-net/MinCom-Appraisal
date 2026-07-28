<?php

declare(strict_types=1);

namespace App\State\Admin;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProviderInterface;
use App\ApiResource\Admin\UserAdminResource;
use App\ApiResource\Admin\UserAdminResourceFactory;
use App\Repository\UserRepository;
use Symfony\Component\Uid\Uuid;

/**
 * Fetches the target User for Patch. Returning null here makes API
 * Platform raise its own not-found handling, which our ExceptionListener
 * then reshapes into the standard 404 envelope — same behavior as
 * AdminUserUpdateView's `except User.DoesNotExist` branch.
 */
final class UserAdminItemProvider implements ProviderInterface
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly UserAdminResourceFactory $resourceFactory,
    ) {
    }

    public function provide(Operation $operation, array $uriVariables = [], array $context = []): ?UserAdminResource
    {
        if (!Uuid::isValid((string) ($uriVariables['id'] ?? ''))) {
            return null;
        }

        $user = $this->users->find(Uuid::fromString($uriVariables['id']));

        return $user === null ? null : $this->resourceFactory->fromEntity($user);
    }
}
