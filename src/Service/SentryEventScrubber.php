<?php

declare(strict_types=1);

namespace App\Service;

use Sentry\Event;
use Sentry\EventHint;
use Sentry\UserDataBag;

/**
 * Port of utils/sentry.py's `scrub_sensitive_data` — the Sentry
 * `before_send` callback. Strips PII (employee names, scores, comment
 * content, emails) from error events before they leave the process.
 *
 * Narrower than Django's version by exactly one rule: Django's rule 3
 * (strip the `Authorization` header from `request.headers`) has no
 * equivalent here because the Sentry PHP SDK already does this itself
 * by default (`RequestIntegration::DEFAULT_SENSITIVE_HEADERS` covers
 * Authorization/Proxy-Authorization/Cookie/Set-Cookie) — reimplementing
 * it would be redundant, not a gap.
 *
 * Registered as the `before_send` service in config/packages/sentry.yaml
 * — the Sentry Symfony bundle resolves that config value to a DI
 * container Reference, so this class must itself be callable
 * (Sentry\Options requires `before_send` to satisfy PHP's `callable`).
 */
final class SentryEventScrubber
{
    /**
     * Context/extra keys that may contain PII — identical set to
     * Django's `_PII_KEYS`.
     */
    private const PII_KEYS = [
        // Names
        'employee_name', 'full_name', 'name',
        // Scores
        'score', 'scores', 'total_score', 'kd_average_score', 'bc_average_score',
        // Comments / content
        'comment', 'comment_content', 'content', 'body', 'reason',
        // Email / username
        'email', 'username',
    ];

    /**
     * Context names where PII-key scrubbing is applied. Matches
     * Django's `_PII_SCRUB_CONTEXT_ALLOWLIST` — deliberately narrow
     * (just `browser`) to avoid false positives in SDK-managed
     * contexts like `runtime`, where `name` means "PHP", not a person.
     */
    private const PII_SCRUB_CONTEXT_ALLOWLIST = ['browser'];

    /**
     * SDK-managed contexts that must NOT be scrubbed — technical
     * metadata, not PII. Matches Django's `_SDK_MANAGED_CONTEXTS`.
     */
    private const SDK_MANAGED_CONTEXTS = ['runtime', 'os', 'device', 'app', 'gpu', 'trace', 'otel'];

    /** Query-string parameters that may contain search terms. */
    private const SEARCH_PARAMS = ['search', 'q', 'query'];

    private const REDACTED = '[Filtered]';

    public function __invoke(Event $event, ?EventHint $hint = null): ?Event
    {
        // Rule 1: strip PII keys from extra and eligible contexts.
        $event->setExtra($this->stripPiiKeys($event->getExtra()));

        foreach ($event->getContexts() as $contextName => $contextData) {
            if ($this->shouldScrubContext($contextName)) {
                $event->setContext($contextName, $this->stripPiiKeys($contextData));
            }
        }

        // Rule 2: anonymise the user context — keep only the id.
        $user = $event->getUser();
        if ($user !== null) {
            $id = $user->getId();
            $anonymised = new UserDataBag();
            if ($id !== null) {
                $anonymised->setId($id);
            }
            $event->setUser($anonymised);
        }

        // Rule 3 (search query params) — auth-header stripping is
        // already handled by the SDK itself, see class docblock.
        $request = $event->getRequest();
        if (isset($request['query_string']) && is_string($request['query_string'])) {
            $request['query_string'] = $this->stripSearchParams($request['query_string']);
            $event->setRequest($request);
        }

        return $event;
    }

    /**
     * @param array<string, mixed> $data
     *
     * @return array<string, mixed>
     */
    private function stripPiiKeys(array $data): array
    {
        foreach ($data as $key => $value) {
            if (in_array($key, self::PII_KEYS, true)) {
                $data[$key] = self::REDACTED;
            }
        }

        return $data;
    }

    private function shouldScrubContext(string $contextName): bool
    {
        if (in_array($contextName, self::PII_SCRUB_CONTEXT_ALLOWLIST, true)) {
            return true;
        }
        if (in_array($contextName, self::SDK_MANAGED_CONTEXTS, true)) {
            return false;
        }

        // Unknown/custom contexts are scrubbed as a safety default.
        return true;
    }

    private function stripSearchParams(string $queryString): string
    {
        if ($queryString === '') {
            return $queryString;
        }

        parse_str($queryString, $params);
        foreach (self::SEARCH_PARAMS as $param) {
            unset($params[$param]);
        }

        return http_build_query($params);
    }
}
