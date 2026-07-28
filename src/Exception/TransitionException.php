<?php

declare(strict_types=1);

namespace App\Exception;

/**
 * Port of apps.appraisals.workflow.TransitionError. Raised when a
 * workflow transition guard fails. `code` is one of INVALID_TRANSITION,
 * GUARD_FAILED, WRONG_ROLE — the controller maps WRONG_ROLE to 403 and
 * everything else to 400, matching Django's view-level except clause
 * (this is a plain domain exception, not an HttpException, since the
 * HTTP mapping is the controller's decision here, same as Django).
 */
final class TransitionException extends \RuntimeException
{
    public function __construct(string $message, public readonly string $transitionCode)
    {
        parent::__construct($message);
    }
}
