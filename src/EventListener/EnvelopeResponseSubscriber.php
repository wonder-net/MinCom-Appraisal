<?php

declare(strict_types=1);

namespace App\EventListener;

use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Port of backend/utils/renderers.py's StandardResponseRenderer. Wraps every
 * JSON response (from plain controllers and API Platform resources alike) in:
 *
 *   {"status": "success", "data": ..., "meta": {"pagination": {...}}}
 *
 * Deliberately matches on the Content-Type header rather than `instanceof
 * JsonResponse`: API Platform's own response-building produces plain
 * Symfony\Component\HttpFoundation\Response instances with a JSON body, not
 * JsonResponse, so an instanceof check would silently skip every API
 * Platform resource.
 *
 * Two ways a paginated collection communicates its pagination metadata:
 *
 *  1. Plain controllers: the body itself is shaped
 *     {"results": [...], "pagination": {...}} (mirroring StandardOffsetPagination).
 *  2. API Platform providers (e.g. UserAdminCollectionProvider): the
 *     provider sets a `pagination` request attribute (API Platform's own
 *     collection normalization has no such convention, and reshaping its
 *     Hydra/page-based output after the fact would be far more fragile than
 *     having the provider hand us the metadata directly).
 *
 * Error responses (status >= 400) are left untouched: ExceptionListener
 * already produces the final {"status": "error", ...} shape for anything that
 * goes through the exception mechanism. A controller that hand-builds an
 * error response without throwing is still passed through unwrapped here
 * as a safety fallback, matching the Django renderer's behaviour.
 */
#[AsEventListener(event: KernelEvents::RESPONSE, priority: -100)]
final class EnvelopeResponseSubscriber
{
    public function __invoke(ResponseEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }

        $response = $event->getResponse();

        if (!str_contains($response->headers->get('Content-Type') ?? '', 'json')) {
            return;
        }

        $decoded = json_decode((string) $response->getContent(), true);

        if ($response->getStatusCode() >= 400) {
            if (is_array($decoded) && array_key_exists('status', $decoded)) {
                return; // Already enveloped by ExceptionListener.
            }
            $this->write($response, ['status' => 'error', 'data' => $decoded]);

            return;
        }

        if (is_array($decoded) && array_key_exists('status', $decoded) && array_key_exists('data', $decoded)) {
            return; // Already enveloped upstream — don't double-wrap.
        }

        $meta = [];
        $payload = $decoded;

        $attributePagination = $event->getRequest()->attributes->get('pagination');
        if (is_array($attributePagination)) {
            $meta['pagination'] = $attributePagination;
        } elseif (is_array($decoded) && array_key_exists('results', $decoded)) {
            $payload = $decoded['results'];

            if (is_array($decoded['pagination'] ?? null)) {
                $meta['pagination'] = $decoded['pagination'];
            }
        }

        // json_encode turns an empty PHP array into `[]`; Django's empty dict
        // serialises as `{}` — force object semantics so `meta` stays a dict.
        $this->write($response, ['status' => 'success', 'data' => $payload, 'meta' => $meta === [] ? new \stdClass() : $meta]);
    }

    private function write(Response $response, array $body): void
    {
        $response->setContent(json_encode($body, JSON_THROW_ON_ERROR));
    }
}
