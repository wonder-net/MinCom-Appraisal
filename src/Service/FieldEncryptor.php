<?php

declare(strict_types=1);

namespace App\Service;

/**
 * Port of the encryption half of backend/utils/encryption.py's
 * EncryptedCharField/EncryptedTextField/EncryptedJSONField (AES-256-GCM),
 * used by the Doctrine custom Types in App\Doctrine\Type. Static methods,
 * not a DI service: Doctrine instantiates custom Types itself with no
 * constructor arguments and no container access, so the key is read
 * directly from the environment here rather than injected — a standard
 * pattern for Doctrine Types, not a shortcut.
 *
 * Storage format is `base64(iv[12] . tag[16] . ciphertext)` — a fresh,
 * simpler wire format than Django's JSON envelope. There's no need for
 * byte-for-byte compatibility with Django's ciphertext: the existing
 * Django->Symfony data-migration tool already round-trips through
 * decrypted plaintext JSONL (Django decrypts on export, Symfony encrypts
 * on import), so the two backends never read each other's ciphertext
 * directly.
 *
 * Deliberately does not coalesce `''` to `null` the way Django's
 * `if value in ("", None): return None` does — that only works there
 * because Django's encrypted columns all happen to be nullable in
 * practice. Several Symfony equivalents are `NOT NULL` non-nullable
 * `string` properties, so encrypting `''` as-is (round-trips back to
 * `''`) is the only choice that doesn't violate the column constraint.
 */
final class FieldEncryptor
{
    private const CIPHER = 'aes-256-gcm';
    private const IV_LENGTH = 12;
    private const TAG_LENGTH = 16;

    public static function encrypt(?string $plaintext): ?string
    {
        if ($plaintext === null) {
            return null;
        }

        $iv = random_bytes(self::IV_LENGTH);
        $tag = '';
        $ciphertext = openssl_encrypt($plaintext, self::CIPHER, self::key(), \OPENSSL_RAW_DATA, $iv, $tag, '', self::TAG_LENGTH);
        if ($ciphertext === false) {
            throw new \RuntimeException('Field encryption failed.');
        }

        return base64_encode($iv.$tag.$ciphertext);
    }

    public static function decrypt(?string $stored): ?string
    {
        if ($stored === null) {
            return null;
        }

        $raw = base64_decode($stored, true);
        if ($raw === false || \strlen($raw) < self::IV_LENGTH + self::TAG_LENGTH) {
            throw new \RuntimeException('Malformed encrypted field value.');
        }

        $iv = substr($raw, 0, self::IV_LENGTH);
        $tag = substr($raw, self::IV_LENGTH, self::TAG_LENGTH);
        $ciphertext = substr($raw, self::IV_LENGTH + self::TAG_LENGTH);

        $plaintext = openssl_decrypt($ciphertext, self::CIPHER, self::key(), \OPENSSL_RAW_DATA, $iv, $tag);
        if ($plaintext === false) {
            throw new \RuntimeException('Field decryption failed — ciphertext or tag mismatch (tampered or wrong key).');
        }

        return $plaintext;
    }

    private static function key(): string
    {
        $hex = $_ENV['FIELD_ENCRYPTION_KEY'] ?? getenv('FIELD_ENCRYPTION_KEY');
        if (!is_string($hex) || $hex === '') {
            throw new \RuntimeException('FIELD_ENCRYPTION_KEY is not set.');
        }

        $key = hex2bin($hex);
        if ($key === false || \strlen($key) !== 32) {
            throw new \RuntimeException('FIELD_ENCRYPTION_KEY must be a hex-encoded 32-byte (64 hex character) key.');
        }

        return $key;
    }
}
