<?php

declare(strict_types=1);

namespace App\EventListener;

use App\Controller\Auth\AuthErrorResponses;
use Lexik\Bundle\JWTAuthenticationBundle\Event\JWTExpiredEvent;
use Lexik\Bundle\JWTAuthenticationBundle\Event\JWTInvalidEvent;
use Lexik\Bundle\JWTAuthenticationBundle\Event\JWTNotFoundEvent;
use Lexik\Bundle\JWTAuthenticationBundle\Events;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Uid\Uuid;

/**
 * Lexik's JWTAuthenticator builds its own {"code":401,"message":...} error
 * shape for missing/invalid/expired tokens and returns it directly from the
 * authenticator (bypassing kernel.exception / our ExceptionListener
 * entirely). These three listeners override that response so every
 * authentication failure — regardless of which layer produced it — comes
 * back in the same envelope as backend/utils/exception_handlers.py's
 * default 401 (AUTHENTICATION_FAILED).
 *
 * JWT_INVALID/JWT_EXPIRED fire whenever Lexik's authenticate() rejects a
 * present-but-bad token — unaffected by kernel.exception priority. JWT_NOT_FOUND
 * fires from the firewall's entry point (start()), normally reached via
 * Symfony Security's own kernel.exception listener redirecting an
 * unauthenticated request — but ExceptionListener (priority 50) now
 * intercepts and stops propagation before Security's listener (priority 1)
 * ever runs, handling the "no token" 401 itself. onJwtNotFound is kept for
 * defense-in-depth in case some other path still invokes the entry point.
 */
final class JwtFailureListener
{
    #[AsEventListener(event: Events::JWT_NOT_FOUND)]
    public function onJwtNotFound(JWTNotFoundEvent $event): void
    {
        $event->setResponse($this->buildResponse($event->getRequest()));
    }

    #[AsEventListener(event: Events::JWT_INVALID)]
    public function onJwtInvalid(JWTInvalidEvent $event): void
    {
        $event->setResponse($this->buildResponse($event->getRequest()));
    }

    #[AsEventListener(event: Events::JWT_EXPIRED)]
    public function onJwtExpired(JWTExpiredEvent $event): void
    {
        $event->setResponse($this->buildResponse($event->getRequest()));
    }

    private function buildResponse(Request $request): JsonResponse
    {
        $correlationId = $request->attributes->get('correlation_id');
        $correlationId = is_string($correlationId) && $correlationId !== '' ? $correlationId : Uuid::v4()->toRfc4122();

        return AuthErrorResponses::detailed(
            'Authentication credentials were not provided or are invalid.',
            'AUTHENTICATION_FAILED',
            401,
            $correlationId,
        );
    }
}
