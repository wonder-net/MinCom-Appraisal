<?php

declare(strict_types=1);

namespace App\Exception;

/**
 * Marker for exceptions whose getMessage() is safe to send to API clients.
 *
 * Framework-thrown exceptions (routing 404s/405s, generic security denials)
 * often embed internal details (URLs, class names) in getMessage() — those
 * must fall back to the generic per-status-code message in ExceptionListener.
 * Application code that wants to surface a specific, user-safe message
 * (Django's ConflictError-style custom exceptions) should throw an exception
 * implementing this interface instead.
 */
interface ClientSafeMessageInterface
{
}
