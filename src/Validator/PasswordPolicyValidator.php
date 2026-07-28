<?php

declare(strict_types=1);

namespace App\Validator;

use App\Service\PwnedPasswordService;
use Symfony\Component\Validator\Constraint;
use Symfony\Component\Validator\ConstraintValidator;
use Symfony\Component\Validator\Exception\UnexpectedTypeException;

final class PasswordPolicyValidator extends ConstraintValidator
{
    public function __construct(private readonly PwnedPasswordService $pwnedPasswords)
    {
    }

    public function validate(mixed $value, Constraint $constraint): void
    {
        if (!$constraint instanceof PasswordPolicy) {
            throw new UnexpectedTypeException($constraint, PasswordPolicy::class);
        }

        if (!is_string($value) || $value === '') {
            return; // NotBlank (if present) reports emptiness; nothing to check here.
        }

        if (strlen($value) < 8) {
            $this->context->buildViolation($constraint->tooShortMessage)->addViolation();
        }

        if (ctype_digit($value)) {
            $this->context->buildViolation($constraint->numericMessage)->addViolation();
        }

        if (CommonPasswords::contains(strtolower(trim($value)))) {
            $this->context->buildViolation($constraint->commonMessage)->addViolation();
        }

        if (!preg_match('/[!@#$%^&*()\-_=+\[\]{};:\'",.<>?\/\\\\|`~]/', $value)) {
            $this->context->buildViolation($constraint->specialCharMessage)->addViolation();
        }

        if (!preg_match('/[A-Z]/', $value)) {
            $this->context->buildViolation($constraint->uppercaseMessage)->addViolation();
        }

        if ($this->pwnedPasswords->isBreached($value)) {
            $this->context->buildViolation($constraint->breachedMessage)->addViolation();
        }
    }
}
