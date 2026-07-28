<?php

declare(strict_types=1);

namespace App\Controller\Auth;

use Symfony\Component\HttpFoundation\JsonResponse;

/**
 * Hand-built error envelopes for the auth endpoints that intentionally
 * bypass ExceptionListener (see views.py's LoginView._generic_auth_error,
 * TokenRefreshView, LogoutView — none of these raise exceptions, they
 * return pre-shaped error bodies directly). Faithfully reproduces two
 * distinct shapes Django uses inconsistently across these views:
 *
 *  - "simple" (message + code only) for CAPTCHA_REQUIRED/CAPTCHA_FAILED,
 *    NO_SPA_ROLES_ASSIGNED, SESSION_EXPIRED, ACCOUNT_DEACTIVATED.
 *  - "detailed" (+ errors: [] and correlation_id) for every AUTHENTICATION_FAILED
 *    / TOKEN_OWNERSHIP_MISMATCH response.
 */
final class AuthErrorResponses
{
    public static function simple(string $message, string $code, int $status): JsonResponse
    {
        return new JsonResponse(['status' => 'error', 'data' => ['message' => $message, 'code' => $code]], $status);
    }

    public static function detailed(string $message, string $code, int $status, string $correlationId): JsonResponse
    {
        return new JsonResponse([
            'status' => 'error',
            'data' => [
                'message' => $message,
                'code' => $code,
                'errors' => [],
                'correlation_id' => $correlationId,
            ],
        ], $status);
    }

    public static function genericAuthFailure(
        string $correlationId,
        ?int $lockoutRemainingSeconds = null,
        bool $captchaRequired = false,
    ): JsonResponse {
        $data = [
            'message' => 'Invalid credentials. Please try again.',
            'code' => 'AUTHENTICATION_FAILED',
            'errors' => [],
            'correlation_id' => $correlationId,
        ];

        if ($lockoutRemainingSeconds !== null) {
            $data['lockout_remaining_seconds'] = $lockoutRemainingSeconds;
        }

        if ($captchaRequired) {
            $data['captcha_required'] = true;
        }

        return new JsonResponse(['status' => 'error', 'data' => $data], 401);
    }
}
