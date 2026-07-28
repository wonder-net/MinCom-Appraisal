<?php

declare(strict_types=1);

namespace App\Dto\Auth;

use Symfony\Component\Validator\Constraints as Assert;

/**
 * Port of Django's MFAPasswordConfirmationSerializer: a single required
 * password field, reused by MfaDisableController and
 * MfaRecoveryCodesRegenerateController.
 */
final class PasswordConfirmationRequest
{
    #[Assert\NotBlank]
    public string $password = '';
}
