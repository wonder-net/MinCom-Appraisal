<?php

declare(strict_types=1);

namespace App\Validator;

use Symfony\Component\Validator\Constraint;

/**
 * Port of Django's AUTH_PASSWORD_VALIDATORS chain (config/settings/base.py):
 * MinimumLengthValidator(8), NumericPasswordValidator, CommonPasswordValidator,
 * SpecialCharacterValidator, UppercaseValidator, HaveIBeenPwnedValidator — all
 * run independently and every failure is reported (mirrors
 * validate_password() collecting every validator's message, not just the
 * first failure).
 */
#[\Attribute(\Attribute::TARGET_PROPERTY)]
final class PasswordPolicy extends Constraint
{
    public string $tooShortMessage = 'This password is too short. It must contain at least 8 characters.';
    public string $numericMessage = 'This password is entirely numeric.';
    public string $commonMessage = 'This password is too common.';
    public string $specialCharMessage = 'Your password must contain at least one special character (e.g., ! @ # $ % ^ & *).';
    public string $uppercaseMessage = 'Your password must contain at least one uppercase letter.';
    public string $breachedMessage = 'This password has appeared in a known data breach. Please choose a different password.';

    public function validatedBy(): string
    {
        return PasswordPolicyValidator::class;
    }
}
