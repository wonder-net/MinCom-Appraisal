<?php

declare(strict_types=1);

namespace App\Exception;

/**
 * Port of services.DuplicateSignatureError: the requesting user already
 * signed this appraisal within its current signing round. The
 * controller maps this to 409 with code ALREADY_SIGNED.
 */
final class DuplicateSignatureException extends \RuntimeException
{
}
