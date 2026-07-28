<?php

declare(strict_types=1);

namespace App\EventListener;

use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;
use Symfony\Component\Uid\Uuid;

/**
 * Port of backend/utils/middleware.py's CorrelationIdMiddleware: reads an
 * incoming X-Correlation-ID header (or generates one), stores it on the
 * request so ExceptionListener/EnvelopeResponseSubscriber can use it, and
 * echoes it back on the response.
 */
final class CorrelationIdListener
{
    public const HEADER_NAME = 'X-Correlation-ID';

    #[AsEventListener(event: KernelEvents::REQUEST, priority: 250)]
    public function onKernelRequest(RequestEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }

        $request = $event->getRequest();
        $incoming = $request->headers->get(self::HEADER_NAME);
        $correlationId = is_string($incoming) && $incoming !== '' ? $incoming : Uuid::v4()->toRfc4122();

        $request->attributes->set('correlation_id', $correlationId);
    }

    #[AsEventListener(event: KernelEvents::RESPONSE, priority: -250)]
    public function onKernelResponse(ResponseEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }

        $correlationId = $event->getRequest()->attributes->get('correlation_id');
        if (is_string($correlationId)) {
            $event->getResponse()->headers->set(self::HEADER_NAME, $correlationId);
        }
    }
}
