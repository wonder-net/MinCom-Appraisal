<?php

declare(strict_types=1);

namespace App\Tests\Unit\Service;

use App\Service\AuditRequestContext;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;

/**
 * Port of the request-metadata slice of Django's AuditContextMiddleware
 * (backend/utils/middleware.py) — see AuditRequestContext's docblock
 * for why this is a thin RequestStack wrapper rather than a from-scratch
 * ambient store.
 */
final class AuditRequestContextTest extends TestCase
{
    public function testReturnsEmptyArrayWhenNoRequestInFlight(): void
    {
        $context = new AuditRequestContext(new RequestStack());

        self::assertSame([], $context->toMetadata());
    }

    public function testReturnsPathMethodAndCorrelationIdForCurrentRequest(): void
    {
        $requestStack = new RequestStack();
        $request = Request::create('/api/v1/appraisals/cycles/', 'POST');
        $request->attributes->set('correlation_id', 'abc-123');
        $requestStack->push($request);

        $context = new AuditRequestContext($requestStack);

        self::assertSame([
            'correlation_id' => 'abc-123',
            'request_path' => '/api/v1/appraisals/cycles/',
            'request_method' => 'POST',
        ], $context->toMetadata());
    }

    public function testCorrelationIdDefaultsToEmptyStringWhenAttributeMissing(): void
    {
        $requestStack = new RequestStack();
        $requestStack->push(Request::create('/api/v1/health/'));

        $context = new AuditRequestContext($requestStack);

        self::assertSame('', $context->toMetadata()['correlation_id']);
    }
}
