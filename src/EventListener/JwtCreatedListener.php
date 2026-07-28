<?php

declare(strict_types=1);

namespace App\EventListener;

use App\Entity\User;
use App\Repository\EmployeeRepository;
use App\Security\Jwt\PendingSessionContext;
use Lexik\Bundle\JWTAuthenticationBundle\Event\JWTCreatedEvent;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Lexik\Bundle\JWTAuthenticationBundle\Events;

/**
 * Port of CustomTokenObtainPairSerializer.get_token(): injects the same
 * custom claims into every minted access token.
 */
#[AsEventListener(event: Events::JWT_CREATED)]
final class JwtCreatedListener
{
    public function __construct(
        private readonly PendingSessionContext $pendingSessionContext,
        private readonly EmployeeRepository $employees,
    ) {
    }

    public function __invoke(JWTCreatedEvent $event): void
    {
        $user = $event->getUser();

        if (!$user instanceof User) {
            return;
        }

        $data = $event->getData();
        $employee = $this->employees->findByUser($user);

        $data['user_id'] = (string) $user->getId();
        $data['email'] = $user->getEmail();
        $data['roles'] = array_map(static fn ($name) => $name->value, $user->getRoleNames());
        $data['is_mfa_enabled'] = $user->isMfaEnabled();
        $data['employee_id'] = $employee !== null ? (string) $employee->getId() : null;
        $data['must_change_password'] = $user->getLastPasswordChange() === null;
        $data['session_start'] = $this->pendingSessionContext->consumeSessionStart()->getTimestamp();

        $event->setData($data);
    }
}
