<?php

declare(strict_types=1);

namespace App\Dto\Auth;

use Symfony\Component\Serializer\Attribute\SerializedName;
use Symfony\Component\Validator\Constraints as Assert;

final class LoginRequest
{
    #[Assert\NotBlank]
    public string $identifier = '';

    #[Assert\NotBlank]
    public string $password = '';

    #[SerializedName('captcha_token')]
    public ?string $captchaToken = null;
}
