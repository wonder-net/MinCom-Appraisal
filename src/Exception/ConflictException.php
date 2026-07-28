<?php

declare(strict_types=1);

namespace App\Exception;

use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

/**
 * A 409 whose message is safe to surface verbatim (e.g. "A user with this
 * email already exists.") — see ClientSafeMessageInterface. The error code
 * defaults to the generic CONFLICT but can be overridden (e.g.
 * INVITATION_ALREADY_USED) so the frontend can distinguish specific
 * conflict reasons that share the same HTTP status.
 */
final class ConflictException extends ConflictHttpException implements ClientSafeMessageInterface, ErrorCodeOverrideInterface
{
    public function __construct(string $message, private readonly string $errorCode = 'CONFLICT')
    {
        parent::__construct($message);
    }

    public function getErrorCode(): string
    {
        return $this->errorCode;
    }
}
