<?php

declare(strict_types=1);

namespace App\Service;

/**
 * Port of apps.accounts.services.generate_temp_password(): an 8-character
 * alphanumeric password, single-use by convention (last_password_change
 * stays null until the recipient sets their own).
 */
final class TempPasswordGenerator
{
    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    private const LENGTH = 8;

    public function generate(): string
    {
        $password = '';
        for ($i = 0; $i < self::LENGTH; ++$i) {
            $password .= self::ALPHABET[random_int(0, strlen(self::ALPHABET) - 1)];
        }

        return $password;
    }
}
