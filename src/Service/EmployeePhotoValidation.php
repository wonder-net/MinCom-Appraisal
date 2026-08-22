<?php

declare(strict_types=1);

namespace App\Service;

/**
 * Result of EmployeePhotoUploadValidator::validate(): either a detected
 * file extension (success) or an error message (failure), never both.
 */
final class EmployeePhotoValidation
{
    private function __construct(
        public readonly ?string $extension,
        public readonly ?string $error,
    ) {
    }

    public static function ok(string $extension): self
    {
        return new self($extension, null);
    }

    public static function error(string $message): self
    {
        return new self(null, $message);
    }
}
