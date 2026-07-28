<?php

declare(strict_types=1);

namespace App\Dto\Auth;

use Symfony\Component\Validator\Constraints as Assert;

final class MfaVerifyRequest
{
    #[Assert\NotBlank]
    #[Assert\Length(exactly: 6)]
    public string $code = '';
}
