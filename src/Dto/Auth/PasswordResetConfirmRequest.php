<?php

declare(strict_types=1);

namespace App\Dto\Auth;

use App\Validator\PasswordPolicy;
use Symfony\Component\Serializer\Attribute\SerializedName;
use Symfony\Component\Validator\Constraints as Assert;

final class PasswordResetConfirmRequest
{
    #[Assert\NotBlank]
    #[Assert\Length(exactly: 64)]
    public string $token = '';

    #[SerializedName('new_password')]
    #[Assert\NotBlank]
    #[PasswordPolicy]
    public string $newPassword = '';

    #[SerializedName('new_password_confirm')]
    #[Assert\NotBlank]
    public string $newPasswordConfirm = '';
}
