<?php

declare(strict_types=1);

namespace App\Dto\Auth;

use Symfony\Component\Serializer\Attribute\SerializedName;
use Symfony\Component\Validator\Constraints as Assert;

/**
 * Deliberately NOT using #[PasswordPolicy] on newPassword here: Django's
 * PasswordChangeSerializer.validate() checks old-password-correctness,
 * same-password rejection, and confirm-match BEFORE running the complexity
 * validators (in that exact order), so PasswordChangeController replicates
 * that sequencing by validating the policy manually, after those checks —
 * see the controller. (Contrast with reset-confirm, where DRF's field-level
 * validate_new_password runs before the object-level confirm-match check,
 * so #[PasswordPolicy] on the DTO there already matches Django's order.)
 */
final class PasswordChangeRequest
{
    #[SerializedName('old_password')]
    #[Assert\NotBlank]
    public string $oldPassword = '';

    #[SerializedName('new_password')]
    #[Assert\NotBlank]
    public string $newPassword = '';

    #[SerializedName('confirm_password')]
    #[Assert\NotBlank]
    public string $confirmPassword = '';
}
