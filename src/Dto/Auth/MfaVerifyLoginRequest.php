<?php

declare(strict_types=1);

namespace App\Dto\Auth;

use Symfony\Component\Serializer\Attribute\SerializedName;
use Symfony\Component\Validator\Constraints as Assert;

final class MfaVerifyLoginRequest
{
    #[SerializedName('mfa_token')]
    #[Assert\NotBlank]
    public string $mfaToken = '';

    #[Assert\Length(exactly: 6)]
    public ?string $code = null;

    #[SerializedName('recovery_code')]
    public ?string $recoveryCode = null;
}
