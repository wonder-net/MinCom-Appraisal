<?php

declare(strict_types=1);

namespace App\Tests\Unit\EventListener;

use App\Entity\User;
use App\EventListener\RateLimitListener;
use PHPUnit\Framework\TestCase;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Event\ControllerEvent;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;
use Symfony\Component\HttpKernel\HttpKernelInterface;
use Symfony\Component\RateLimiter\RateLimiterFactory;
use Symfony\Component\RateLimiter\Storage\InMemoryStorage;

/**
 * Port of DRF's ScopedRateThrottle/AnonRateThrottle/UserRateThrottle
 * behaviour: scope resolution per route, and that a view carrying a
 * specific scope is checked ONLY against that scope (not additionally
 * against anon/user). Uses in-memory limiter storage so runs are
 * isolated from the shared cache pool the app itself uses.
 */
final class RateLimitListenerTest extends TestCase
{
    private function makeListener(int $limit, ?User $user = null): RateLimitListener
    {
        $security = $this->createStub(Security::class);
        $security->method('getUser')->willReturn($user);

        $factory = static fn (string $id): RateLimiterFactory => new RateLimiterFactory(
            ['id' => $id, 'policy' => 'fixed_window', 'limit' => $limit, 'interval' => '1 minute'],
            new InMemoryStorage(),
        );

        return new RateLimitListener(
            $security,
            $factory('anon'),
            $factory('user'),
            $factory('auth'),
            $factory('bulk_import_user_create'),
            $factory('bulk_import_user_commit'),
        );
    }

    private function makeEvent(string $routeName): ControllerEvent
    {
        $kernel = $this->createStub(HttpKernelInterface::class);
        $request = Request::create('/api/v1/whatever/');
        $request->attributes->set('_route', $routeName);

        return new ControllerEvent($kernel, static fn () => null, $request, HttpKernelInterface::MAIN_REQUEST);
    }

    public function testAllowsRequestsUnderTheLimit(): void
    {
        $listener = $this->makeListener(limit: 2);

        $listener($this->makeEvent('auth_login'));
        $listener($this->makeEvent('auth_login'));

        $this->addToAssertionCount(2);
    }

    public function testThrowsTooManyRequestsOnceLimitExceeded(): void
    {
        $listener = $this->makeListener(limit: 1);

        $listener($this->makeEvent('auth_login'));

        $this->expectException(TooManyRequestsHttpException::class);
        $listener($this->makeEvent('auth_login'));
    }

    public function testBulkImportCreateAndCommitScopesAreIndependentBuckets(): void
    {
        $listener = $this->makeListener(limit: 1);

        $listener($this->makeEvent('admin_user_bulk_import_jobs_create'));
        $listener($this->makeEvent('admin_user_bulk_import_jobs_commit'));

        $this->addToAssertionCount(2);
    }

    public function testUnscopedRouteUsesAnonBucketWhenUnauthenticated(): void
    {
        $listener = $this->makeListener(limit: 1);

        $listener($this->makeEvent('employees_list'));

        $this->expectException(TooManyRequestsHttpException::class);
        $listener($this->makeEvent('employees_list'));
    }

    public function testUnscopedRouteUsesUserBucketWhenAuthenticated(): void
    {
        $user = new User('rate-limited@example.com');
        $listener = $this->makeListener(limit: 1, user: $user);

        $listener($this->makeEvent('employees_list'));

        $this->expectException(TooManyRequestsHttpException::class);
        $listener($this->makeEvent('employees_list'));
    }

    public function testAuthenticatedAndAnonymousRequestsUseSeparateBuckets(): void
    {
        $listener = $this->makeListener(limit: 1);
        $listener($this->makeEvent('employees_list'));

        $authedListener = $this->makeListener(limit: 1, user: new User('separate-bucket@example.com'));
        $authedListener($this->makeEvent('employees_list'));

        $this->addToAssertionCount(2);
    }

    public function testNonMainRequestIsIgnored(): void
    {
        $security = $this->createStub(Security::class);
        $security->method('getUser')->willReturn(null);

        $factory = static fn (string $id): RateLimiterFactory => new RateLimiterFactory(
            ['id' => $id, 'policy' => 'fixed_window', 'limit' => 1, 'interval' => '1 minute'],
            new InMemoryStorage(),
        );
        $listener = new RateLimitListener($security, $factory('anon'), $factory('user'), $factory('auth'), $factory('bulk_import_user_create'), $factory('bulk_import_user_commit'));

        $kernel = $this->createStub(HttpKernelInterface::class);
        $request = Request::create('/api/v1/whatever/');
        $request->attributes->set('_route', 'auth_login');
        $subRequestEvent = new ControllerEvent($kernel, static fn () => null, $request, HttpKernelInterface::SUB_REQUEST);

        $listener($subRequestEvent);
        $listener($subRequestEvent);

        $this->addToAssertionCount(2);
    }
}
