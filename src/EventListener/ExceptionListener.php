<?php

declare(strict_types=1);

namespace App\EventListener;

use App\Exception\ClientSafeMessageInterface;
use App\Exception\ErrorCodeOverrideInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\KernelEvents;
use Symfony\Component\Security\Core\Authentication\AuthenticationTrustResolverInterface;
use Symfony\Component\Security\Core\Authentication\Token\Storage\TokenStorageInterface;
use Symfony\Component\Security\Core\Exception\AccessDeniedException as SecurityAccessDeniedException;
use Symfony\Component\Security\Core\Exception\AuthenticationException;
use Symfony\Component\Uid\Uuid;
use Symfony\Component\Validator\Exception\ValidationFailedException;

/**
 * Reproduces backend/utils/exception_handlers.py's error envelope exactly:
 *
 *   {"status": "error", "data": {"message", "code", "errors", "correlation_id"}}
 *
 * Priority is deliberately high (runs first, before both Symfony Security's
 * per-firewall exception listener at priority 1 and API Platform's
 * ExceptionListener at priority -96) and unconditionally handles
 * security-core AuthenticationException/AccessDeniedException itself
 * (mapped to 401/403 below) rather than deferring to Security's own
 * redirect-to-entry-point handling. That deferral was tried first and
 * doesn't work in general: API Platform's ExceptionListener always rebuilds
 * its own problem+json response for any api-platform-routed request
 * regardless of what an earlier listener already set, so relying on
 * Security running first and us merely respecting `hasResponse()`
 * self-defeats the moment a request is API-Platform-routed. Going first
 * and calling stopPropagation() below sidesteps the ordering fight
 * entirely. JwtFailureListener is unaffected — it handles a Bearer token
 * that IS present but invalid/expired, which Lexik's authenticator resolves
 * directly without ever raising a kernel exception.
 */
#[AsEventListener(event: KernelEvents::EXCEPTION, priority: 50)]
final class ExceptionListener
{
    /** @var array<int, array{0: string, 1: string}> Mirrors _STATUS_CODE_MAP in exception_handlers.py */
    private const STATUS_CODE_MAP = [
        400 => ['VALIDATION_ERROR', 'Validation failed.'],
        401 => ['AUTHENTICATION_FAILED', 'Authentication credentials were not provided or are invalid.'],
        403 => ['PERMISSION_DENIED', 'You do not have permission to perform this action.'],
        404 => ['NOT_FOUND', 'The requested resource was not found.'],
        405 => ['METHOD_NOT_ALLOWED', 'This HTTP method is not allowed for this endpoint.'],
        409 => ['CONFLICT', 'The request conflicts with the current state of the resource.'],
        429 => ['THROTTLED', 'Request was throttled. Please try again later.'],
    ];

    private const INTERNAL_ERROR_CODE = 'INTERNAL_ERROR';
    private const INTERNAL_ERROR_MESSAGE = 'An unexpected error occurred. Please try again later.';

    public function __construct(
        private readonly LoggerInterface $logger,
        private readonly TokenStorageInterface $tokenStorage,
        private readonly AuthenticationTrustResolverInterface $trustResolver,
    ) {
    }

    public function __invoke(ExceptionEvent $event): void
    {
        if ($event->hasResponse()) {
            // Defensive: nothing currently runs before us, but if it ever
            // does, don't clobber a response it deliberately set.
            return;
        }

        if (!str_starts_with($event->getRequest()->getPathInfo(), '/api/')) {
            // This envelope is for the JSON API only. The /admin panel
            // is a server-rendered Twig UI on its own session-based
            // firewall (see security.yaml) — an anonymous visitor there
            // should get Symfony's normal redirect-to-login behaviour,
            // not a JSON 401. Returning here without setting a response
            // lets that default handling run instead.
            return;
        }

        $exception = $event->getThrowable();
        $correlationId = $this->resolveCorrelationId($event);
        $validationFailure = $this->findValidationFailure($exception);

        $statusCode = match (true) {
            // Django's DRF ValidationError always maps to 400, never 422 —
            // even though both ValidationErrorFactory and Symfony's native
            // #[MapRequestPayload] failure conventionally throw a 422
            // UnprocessableEntityHttpException. Forcing 400 here whenever a
            // ValidationFailedException is present (regardless of the
            // wrapping exception's own nominal status) fixes both sources
            // at once. This does NOT affect the two genuinely-422 Django
            // cases (malformed bulk-import upload, Excel template mismatch)
            // since those return a JsonResponse directly from the
            // controller rather than throwing a ValidationFailedException.
            $validationFailure !== null => 400,
            $exception instanceof HttpExceptionInterface => $exception->getStatusCode(),
            $exception instanceof AuthenticationException => 401,
            // Mirrors Security's own handleAccessDeniedException: a voter
            // denying IS_AUTHENTICATED_FULLY because there's no token at all
            // (or it's not "full-fledged") means "log in", not "forbidden" —
            // 401, not 403. Only a genuinely authenticated-but-unauthorized
            // token gets 403.
            $exception instanceof SecurityAccessDeniedException => $this->trustResolver->isFullFledged($this->tokenStorage->getToken()) ? 403 : 401,
            default => 500,
        };

        [$errorCode, $defaultMessage] = self::STATUS_CODE_MAP[$statusCode]
            ?? [self::INTERNAL_ERROR_CODE, self::INTERNAL_ERROR_MESSAGE];

        if ($exception instanceof ErrorCodeOverrideInterface) {
            $errorCode = $exception->getErrorCode();
        }

        $validationFailure = $this->findValidationFailure($exception);

        if ($validationFailure !== null) {
            $fieldErrors = array_map(
                static fn ($violation): array => [
                    'field' => $violation->getPropertyPath() ?: 'non_field_errors',
                    'message' => (string) $violation->getMessage(),
                ],
                iterator_to_array($validationFailure->getViolations()),
            );
            $message = $defaultMessage;
        } else {
            $fieldErrors = [];
            $message = $exception instanceof ClientSafeMessageInterface && $exception->getMessage() !== ''
                ? $exception->getMessage()
                : $defaultMessage;
        }

        if ($statusCode >= 500) {
            $this->logger->error('Unhandled exception [correlation_id={correlation_id}]: {message}', [
                'correlation_id' => $correlationId,
                'message' => $exception->getMessage(),
                'exception' => $exception,
            ]);
            $errorCode = self::INTERNAL_ERROR_CODE;
            $message = self::INTERNAL_ERROR_MESSAGE;
            $statusCode = 500;
        }

        $response = new JsonResponse(
            [
                'status' => 'error',
                'data' => [
                    'message' => $message,
                    'code' => $errorCode,
                    'errors' => $fieldErrors,
                    'correlation_id' => $correlationId,
                ],
            ],
            $statusCode,
        );

        // Preserve headers the exception itself carries — most notably
        // TooManyRequestsHttpException's Retry-After, set by
        // RateLimitListener so well-behaved clients know when to back off.
        if ($exception instanceof HttpExceptionInterface) {
            foreach ($exception->getHeaders() as $name => $value) {
                $response->headers->set($name, (string) $value);
            }
        }

        $event->setResponse($response);
        $event->stopPropagation();
    }

    private function findValidationFailure(\Throwable $exception): ?ValidationFailedException
    {
        for ($e = $exception; $e !== null; $e = $e->getPrevious()) {
            if ($e instanceof ValidationFailedException) {
                return $e;
            }
        }

        return null;
    }

    private function resolveCorrelationId(ExceptionEvent $event): string
    {
        $request = $event->getRequest();
        $existing = $request->attributes->get('correlation_id');

        if (is_string($existing) && $existing !== '') {
            return $existing;
        }

        return Uuid::v4()->toRfc4122();
    }
}
