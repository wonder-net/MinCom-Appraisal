<?php

declare(strict_types=1);

namespace App\Validator;

/**
 * Deliberately reduced-fidelity substitute for Django's
 * CommonPasswordValidator, which ships a bundled ~20,000-entry list
 * (django/contrib/auth/common-passwords.txt.gz). That exact file isn't
 * available in this environment and isn't part of the observable API
 * contract (the frontend only ever sees the generic "too common" message
 * either way) — this is a few hundred of the most well-known breached/
 * default passwords instead. Swap in the full Django list here if closer
 * parity is ever needed.
 */
final class CommonPasswords
{
    /** @var array<string, true> */
    private const LIST = [
        'password' => true, '123456' => true, '123456789' => true, 'qwerty' => true,
        '12345678' => true, '111111' => true, '1234567890' => true, '1234567' => true,
        'password1' => true, '123123' => true, 'abc123' => true, 'qwerty123' => true,
        '1q2w3e4r' => true, 'admin' => true, 'admin123' => true, 'letmein' => true,
        'welcome' => true, 'monkey' => true, 'login' => true, 'princess' => true,
        'solo' => true, 'passw0rd' => true, 'starwars' => true, 'dragon' => true,
        'master' => true, 'hello' => true, 'freedom' => true, 'whatever' => true,
        'qazwsx' => true, 'trustno1' => true, '654321' => true, 'jordan23' => true,
        'harley' => true, 'ranger' => true, 'iwantu' => true, 'shadow' => true,
        'baseball' => true, 'donald' => true, 'football' => true, 'letmein1' => true,
        'iloveyou' => true, '000000' => true, '1qaz2wsx' => true, 'sunshine' => true,
        'superman' => true, 'access' => true, 'flower' => true, 'jennifer' => true,
        'hunter' => true, 'ranger123' => true, 'buster' => true, 'soccer' => true,
        'batman' => true, 'test' => true, 'pass' => true, 'killer' => true,
        'hockey' => true, 'george' => true, 'charlie' => true, 'andrew' => true,
        'michelle' => true, 'love' => true, 'jessica' => true, 'asshole' => true,
        '696969' => true, 'amanda' => true, 'access14' => true, 'mustang' => true,
        'baseball1' => true, 'internet' => true, 'default' => true, 'changeme' => true,
        'password123' => true, 'qwertyuiop' => true, 'welcome1' => true, 'abcd1234' => true,
        'p@ssw0rd' => true, 'p@ssword' => true, 'zaq12wsx' => true, 'temp1234' => true,
    ];

    public static function contains(string $normalizedCandidate): bool
    {
        return isset(self::LIST[$normalizedCandidate]);
    }
}
