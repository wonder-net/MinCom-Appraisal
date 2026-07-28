<?php

declare(strict_types=1);

namespace App\Doctrine\Type;

use App\Service\FieldEncryptor;
use Doctrine\DBAL\Platforms\AbstractPlatform;
use Doctrine\DBAL\Types\Type;

/**
 * Port of Django's EncryptedCharField/EncryptedTextField: a plain PHP
 * string, transparently encrypted (AES-256-GCM, via FieldEncryptor) on
 * write and decrypted on read. The database column is always a CLOB
 * (Postgres TEXT) regardless of the PHP-side field's logical length,
 * since ciphertext (base64 of iv+tag+ciphertext) is always longer than
 * the plaintext it replaces.
 *
 * Registered as `encrypted_string` in config/packages/doctrine.yaml.
 */
final class EncryptedStringType extends Type
{
    public const NAME = 'encrypted_string';

    public function getSQLDeclaration(array $column, AbstractPlatform $platform): string
    {
        return $platform->getClobTypeDeclarationSQL($column);
    }

    public function convertToPHPValue(mixed $value, AbstractPlatform $platform): ?string
    {
        if ($value === null) {
            return null;
        }

        return FieldEncryptor::decrypt(is_resource($value) ? stream_get_contents($value) : (string) $value);
    }

    public function convertToDatabaseValue(mixed $value, AbstractPlatform $platform): ?string
    {
        if ($value === null) {
            return null;
        }

        return FieldEncryptor::encrypt((string) $value);
    }
}
