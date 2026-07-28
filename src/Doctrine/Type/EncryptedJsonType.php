<?php

declare(strict_types=1);

namespace App\Doctrine\Type;

use App\Service\FieldEncryptor;
use Doctrine\DBAL\Platforms\AbstractPlatform;
use Doctrine\DBAL\Types\Type;

/**
 * Port of Django's EncryptedJSONField: an arbitrary JSON-serialisable
 * PHP value (array), JSON-encoded then encrypted (AES-256-GCM, via
 * FieldEncryptor) on write, decrypted then JSON-decoded on read. The
 * column is a CLOB (Postgres TEXT), not `json`/`jsonb` — ciphertext
 * isn't valid JSON, so the database can't enforce JSON syntax on it
 * (matching Django, whose EncryptedJSONField is likewise backed by a
 * plain TextField column, not a native json column).
 *
 * Registered as `encrypted_json` in config/packages/doctrine.yaml.
 */
final class EncryptedJsonType extends Type
{
    public const NAME = 'encrypted_json';

    public function getSQLDeclaration(array $column, AbstractPlatform $platform): string
    {
        return $platform->getClobTypeDeclarationSQL($column);
    }

    public function convertToPHPValue(mixed $value, AbstractPlatform $platform): mixed
    {
        if ($value === null) {
            return null;
        }

        $json = FieldEncryptor::decrypt(is_resource($value) ? stream_get_contents($value) : (string) $value);

        return json_decode((string) $json, true, flags: \JSON_THROW_ON_ERROR);
    }

    public function convertToDatabaseValue(mixed $value, AbstractPlatform $platform): ?string
    {
        if ($value === null) {
            return null;
        }

        return FieldEncryptor::encrypt(json_encode($value, \JSON_THROW_ON_ERROR));
    }
}
