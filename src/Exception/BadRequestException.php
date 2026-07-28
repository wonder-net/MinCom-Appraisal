<?php

declare(strict_types=1);

namespace App\Exception;

use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;

/**
 * A 400 whose message is safe to surface verbatim (e.g. "Employee number
 * already exists.", "Department with id '...' does not exist."). Mirrors
 * ConflictException's role for 409s — VALIDATION_ERROR is already the
 * default error code for 400 in ExceptionListener::STATUS_CODE_MAP, so
 * no ErrorCodeOverrideInterface is needed here.
 */
final class BadRequestException extends BadRequestHttpException implements ClientSafeMessageInterface
{
}
