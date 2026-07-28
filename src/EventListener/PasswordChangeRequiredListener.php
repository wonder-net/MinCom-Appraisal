<?php

declare(strict_types=1);

namespace App\EventListener;

use App\Entity\User;
use App\Security\PasswordChangeRequiredException;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpKernel\Event\ControllerEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Port of apps.accounts.permissions.PasswordChangeRequired /
 * utils.middleware.PasswordChangeRequiredMiddleware: a defense-in-depth
 * gate that blocks any authenticated request from a user whose
 * lastPasswordChange is null, except for a small allowlist of endpoints
 * needed to complete the rotation flow itself.
 *
 * Runs on kernel.controller (after the firewall has resolved the user) so
 * it applies uniformly regardless of each controller's own access rules —
 * same rationale Django gives for needing both the DRF permission class
 * AND the middleware.
 */
#[AsEventListener(event: KernelEvents::CONTROLLER, priority: 5)]
final class PasswordChangeRequiredListener
{
    /**
     * Mirrors apps.accounts.permissions.ROTATION_FLOW_ALLOWLIST. Entries for
     * routes not yet ported (employees/me, mfa/setup, mfa/verify) are kept
     * here pre-emptively so this file doesn't need revisiting when those
     * milestones land.
     */
    private const ALLOWLIST = [
        '/api/v1/auth/password/change/',
        '/api/v1/auth/logout/',
        '/api/v1/auth/token/refresh/',
        '/api/v1/employees/me/',
        '/api/v1/auth/mfa/setup/',
        '/api/v1/auth/mfa/verify/',
    ];

    public function __construct(private readonly Security $security)
    {
    }

    public function __invoke(ControllerEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }

        $path = $event->getRequest()->getPathInfo();

        // The /admin panel is a separate, session-based firewall (see
        // security.yaml) with no rotation-flow UI of its own — Django's
        // admin login is likewise untouched by this same forced-reset
        // gate, which only ever guards the JWT API. Without this
        // exemption, any HR_ADMIN/SYSTEM_ADMIN user provisioned via the
        // temp-password flow (bulk import, admin-create-user — both
        // deliberately leave lastPasswordChange null) would be
        // permanently locked out of the admin panel with nowhere to go
        // rotate it from.
        if (str_starts_with($path, '/admin')) {
            return;
        }

        $user = $this->security->getUser();

        if (!$user instanceof User || $user->getLastPasswordChange() !== null) {
            return;
        }

        if (in_array($path, self::ALLOWLIST, true)) {
            return;
        }

        throw new PasswordChangeRequiredException();
    }
}
