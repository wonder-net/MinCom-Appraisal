<?php

declare(strict_types=1);

namespace App\Exception;

/**
 * Port of the PermissionError raised by services.sign_appraisal when the
 * appraisal isn't in PENDING_SIGNOFF or the signer role can't be derived.
 * The controller maps this to 403.
 */
final class SignPermissionException extends \RuntimeException
{
}
