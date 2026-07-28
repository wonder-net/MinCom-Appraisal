<?php

declare(strict_types=1);

namespace App\Security;

use App\Exception\ClientSafeMessageInterface;
use App\Exception\ErrorCodeOverrideInterface;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/**
 * Port of apps.accounts.permissions.PasswordChangeRequiredException: a 403
 * whose `code` is PASSWORD_CHANGE_REQUIRED rather than the generic
 * PERMISSION_DENIED, so the SPA can redirect to /change-password instead of
 * showing a generic "forbidden" error.
 */
final class PasswordChangeRequiredException extends AccessDeniedHttpException implements ClientSafeMessageInterface, ErrorCodeOverrideInterface
{
    public function __construct()
    {
        parent::__construct('Password change required.');
    }

    public function getErrorCode(): string
    {
        return 'PASSWORD_CHANGE_REQUIRED';
    }
}
