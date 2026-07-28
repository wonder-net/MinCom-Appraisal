<?php

declare(strict_types=1);

namespace App\EventListener;

use App\Entity\User;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Event\ControllerEvent;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;
use Symfony\Component\HttpKernel\KernelEvents;
use Symfony\Component\RateLimiter\RateLimiterFactory;

/**
 * Port of Django's DRF throttling (config/settings/base.py's
 * DEFAULT_THROTTLE_CLASSES/DEFAULT_THROTTLE_RATES): global anon/user rate
 * limits, plus a handful of sensitive endpoints scoped tighter via
 * ScopedRateThrottle in apps.accounts.views. Named limiters are defined in
 * config/packages/rate_limiter.yaml.
 *
 * Runs on kernel.controller (after the firewall resolves the user) so
 * scope resolution can key on the authenticated user id — same rationale
 * as PasswordChangeRequiredListener. Higher priority (20 vs. 5): a
 * throttled request shouldn't burn a password-rotation check first.
 *
 * DRF's `throttle_classes` is a full override per view, not additive — a
 * view carrying `throttle_scope = "auth"` is checked ONLY against the auth
 * rate, not also anon/user. resolveLimiter() mirrors that: exactly one
 * limiter applies per request, chosen by route name.
 */
#[AsEventListener(event: KernelEvents::CONTROLLER, priority: 20)]
final class RateLimitListener
{
    /** Routes mirroring the 6 Django views with throttle_scope = "auth". */
    private const AUTH_SCOPE_ROUTES = [
        'auth_login',
        'auth_token_refresh',
        'auth_password_change',
        'auth_mfa_verify_login',
        'auth_password_reset_request',
        'auth_password_reset_confirm',
    ];

    /** Routes mirroring the two bulk_import_user_* scoped views. */
    private const BULK_IMPORT_SCOPE_ROUTES = [
        'admin_user_bulk_import_jobs_create' => 'bulk_import_user_create',
        'admin_user_bulk_import_jobs_commit' => 'bulk_import_user_commit',
    ];

    public function __construct(
        private readonly Security $security,
        #[Autowire(service: 'limiter.anon')]
        private readonly RateLimiterFactory $anonLimiter,
        #[Autowire(service: 'limiter.user')]
        private readonly RateLimiterFactory $userLimiter,
        #[Autowire(service: 'limiter.auth')]
        private readonly RateLimiterFactory $authLimiter,
        #[Autowire(service: 'limiter.bulk_import_user_create')]
        private readonly RateLimiterFactory $bulkImportCreateLimiter,
        #[Autowire(service: 'limiter.bulk_import_user_commit')]
        private readonly RateLimiterFactory $bulkImportCommitLimiter,
    ) {
    }

    public function __invoke(ControllerEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }

        $request = $event->getRequest();
        $routeName = (string) $request->attributes->get('_route');

        [$limiter, $key] = $this->resolveLimiter($routeName, $request);

        $limit = $limiter->create($key)->consume();
        if (!$limit->isAccepted()) {
            $retryAfter = max(1, $limit->getRetryAfter()->getTimestamp() - time());

            throw new TooManyRequestsHttpException((string) $retryAfter);
        }
    }

    /**
     * @return array{0: RateLimiterFactory, 1: string}
     */
    private function resolveLimiter(string $routeName, Request $request): array
    {
        $user = $this->security->getUser();
        $ident = $user instanceof User ? 'user.'.$user->getId() : 'ip.'.($request->getClientIp() ?? 'unknown');

        if (isset(self::BULK_IMPORT_SCOPE_ROUTES[$routeName])) {
            $limiter = self::BULK_IMPORT_SCOPE_ROUTES[$routeName] === 'bulk_import_user_create'
                ? $this->bulkImportCreateLimiter
                : $this->bulkImportCommitLimiter;

            return [$limiter, $ident];
        }

        if (in_array($routeName, self::AUTH_SCOPE_ROUTES, true)) {
            return [$this->authLimiter, $ident];
        }

        if ($user instanceof User) {
            return [$this->userLimiter, $ident];
        }

        return [$this->anonLimiter, $ident];
    }
}
