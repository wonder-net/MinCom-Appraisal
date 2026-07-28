<?php

declare(strict_types=1);

namespace App\Service;

use Symfony\Component\HttpFoundation\RequestStack;

/**
 * Port of the request-scoped slice of Django's AuditContextMiddleware /
 * utils/context.py's `audit_context` ContextVar — specifically the
 * `correlation_id`, `request_path`, `request_method` keys that
 * `_build_audit_kwargs_from_context()` folds into every audit entry's
 * `metadata`.
 *
 * Django needed a contextvars.ContextVar because Python has no
 * built-in DI-injectable "current request" concept; Symfony already
 * has one (RequestStack), so this is just a thin, purpose-built
 * wrapper around it rather than a from-scratch ambient store.
 *
 * `user_id`/`ip_address` are NOT ported here: AuditService::log()
 * already takes both as explicit parameters, and every call site
 * already supplies them directly — only the three request-metadata
 * fields were genuinely missing.
 *
 * Deliberately simpler than Django's actual behaviour: Django only
 * populates these keys for callers going through `audit_log_action()`/
 * `@audit_action` — bare `AuditService.log()` calls get nothing unless
 * the caller manually re-derives them (confirmed inconsistent across
 * Django's own call sites). Symfony has a single `AuditService::log()`
 * entry point everywhere, so wiring this in there once means every
 * Symfony audit entry gets this context, with no per-call-site opt-in
 * needed — a strict improvement, not a deviation to hide.
 */
final class AuditRequestContext
{
    public function __construct(private readonly RequestStack $requestStack)
    {
    }

    /**
     * @return array<string, string>
     */
    public function toMetadata(): array
    {
        $request = $this->requestStack->getCurrentRequest();
        if ($request === null) {
            // No request in flight — a console command, a Messenger
            // worker processing a queued message, etc. Mirrors
            // Django's audit_context ContextVar defaulting to None
            // outside a request, which likewise contributes no keys.
            return [];
        }

        $correlationId = $request->attributes->get('correlation_id');

        return [
            'correlation_id' => is_string($correlationId) ? $correlationId : '',
            'request_path' => $request->getPathInfo(),
            'request_method' => $request->getMethod(),
        ];
    }
}
