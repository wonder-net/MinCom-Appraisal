<?php

declare(strict_types=1);

namespace App\Doctrine\Type;

use Doctrine\DBAL\Platforms\AbstractPlatform;
use Doctrine\DBAL\Types\Type;
use Symfony\Component\Uid\Uuid;

/**
 * Overrides Symfony's built-in `uuid` DBAL type (Symfony\Bridge\Doctrine\
 * Types\UuidType). That type stores as a native GUID column only on
 * platforms that have one (Postgres does; MySQL does not) and otherwise
 * falls back to BINARY(16) — which breaks silently and pervasively under
 * MySQL: Doctrine ORM's generic entity-parameter binding (e.g.
 * ->setParameter('recipient', $userEntity)) infers a plain STRING
 * parameter type for any bound object, bypassing this type's own
 * toBinary()/fromString() conversion entirely, so a query built as
 * `WHERE recipient_id = :recipient` compares a 36-byte string against a
 * 16-byte binary column and silently matches zero rows — found by
 * migrating from Postgres to MySQL and watching ~50 tests fail with
 * "expected 1, got 0" despite every underlying row genuinely existing.
 *
 * This type always stores UUIDs as a fixed CHAR(36) RFC 4122 string
 * regardless of platform, so that naive STRING-typed parameter binding
 * (which Doctrine ORM cannot avoid for entity-object parameters) still
 * produces a byte-for-byte match against the column. Registered under the
 * same `uuid` type name in config/packages/doctrine.yaml, replacing
 * Symfony's default registration.
 */
final class UuidStringType extends Type
{
    public const NAME = 'uuid';

    public function getSQLDeclaration(array $column, AbstractPlatform $platform): string
    {
        return $platform->getStringTypeDeclarationSQL(['length' => 36, 'fixed' => true] + $column);
    }

    public function convertToPHPValue(mixed $value, AbstractPlatform $platform): ?Uuid
    {
        if ($value instanceof Uuid || $value === null) {
            return $value;
        }

        return Uuid::fromString($value);
    }

    public function convertToDatabaseValue(mixed $value, AbstractPlatform $platform): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        if ($value instanceof Uuid) {
            return $value->toRfc4122();
        }

        return Uuid::fromString($value)->toRfc4122();
    }

    public function getName(): string
    {
        return self::NAME;
    }

    public function requiresSQLCommentHint(AbstractPlatform $platform): bool
    {
        return true;
    }
}
