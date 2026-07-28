<?php

declare(strict_types=1);

namespace App\Exception;

/**
 * Port of Django's `code_override` attribute pattern (see
 * apps.accounts.permissions.PasswordChangeRequiredException): lets a
 * specific exception force the response envelope's `code` field away from
 * the generic per-status-code default (e.g. PERMISSION_DENIED ->
 * PASSWORD_CHANGE_REQUIRED) so the frontend can distinguish cases that
 * share an HTTP status but need different client handling.
 */
interface ErrorCodeOverrideInterface
{
    public function getErrorCode(): string;
}
