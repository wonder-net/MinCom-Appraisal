<?php

declare(strict_types=1);

namespace App\Tests\Unit\EventListener;

use App\EventListener\ExceptionListener;
use Psr\Log\NullLogger;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;
use Symfony\Component\HttpKernel\HttpKernelInterface;
use Symfony\Component\Security\Core\Authentication\AuthenticationTrustResolverInterface;
use Symfony\Component\Security\Core\Authentication\Token\Storage\TokenStorageInterface;

/**
 * Regression coverage: a naive `$response->headers->set($name, $value)`
 * forward of an HttpExceptionInterface's headers throws a TypeError when
 * a header value is non-string (HeaderBag::set() requires
 * string|array|null) — exactly what TooManyRequestsHttpException's
 * Retry-After carries when built from an int. That bug turned every
 * throttled (429) response into a 500 in production, only surfacing
 * once RateLimitListener actually started throwing it.
 */
final class ExceptionListenerTest extends TestCase
{
    public function testTooManyRequestsCarriesRetryAfterHeaderAsString(): void
    {
        $listener = new ExceptionListener(
            new NullLogger(),
            $this->createStub(TokenStorageInterface::class),
            $this->createStub(AuthenticationTrustResolverInterface::class),
        );

        $kernel = $this->createStub(HttpKernelInterface::class);
        $event = new ExceptionEvent($kernel, Request::create('/api/v1/auth/login/'), HttpKernelInterface::MAIN_REQUEST, new TooManyRequestsHttpException(60));

        $listener($event);

        $response = $event->getResponse();
        self::assertNotNull($response);
        self::assertSame(429, $response->getStatusCode());
        self::assertSame('60', $response->headers->get('Retry-After'));
        self::assertStringContainsString('THROTTLED', (string) $response->getContent());
    }
}
