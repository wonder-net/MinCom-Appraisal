<?php

declare(strict_types=1);

namespace App\Tests\Unit\Service;

use App\Service\FieldEncryptor;
use PHPUnit\Framework\TestCase;

final class FieldEncryptorTest extends TestCase
{
    public function testRoundTripsPlaintext(): void
    {
        $ciphertext = FieldEncryptor::encrypt('Jane Doe');

        self::assertNotSame('Jane Doe', $ciphertext);
        self::assertSame('Jane Doe', FieldEncryptor::decrypt($ciphertext));
    }

    public function testRoundTripsEmptyString(): void
    {
        $ciphertext = FieldEncryptor::encrypt('');

        self::assertNotSame('', $ciphertext);
        self::assertSame('', FieldEncryptor::decrypt($ciphertext));
    }

    public function testNullPassesThroughBothWays(): void
    {
        self::assertNull(FieldEncryptor::encrypt(null));
        self::assertNull(FieldEncryptor::decrypt(null));
    }

    public function testTwoEncryptionsOfTheSamePlaintextDiffer(): void
    {
        // Random IV per call — proves it's not deterministic/ECB-like.
        self::assertNotSame(FieldEncryptor::encrypt('same value'), FieldEncryptor::encrypt('same value'));
    }

    public function testTamperedCiphertextFailsToDecrypt(): void
    {
        $ciphertext = FieldEncryptor::encrypt('sensitive data');
        $raw = base64_decode($ciphertext, true);
        // Flip a byte inside the ciphertext portion (after the 12-byte IV + 16-byte tag).
        $raw[30] = $raw[30] === "\x00" ? "\x01" : "\x00";
        $tampered = base64_encode($raw);

        $this->expectException(\RuntimeException::class);
        FieldEncryptor::decrypt($tampered);
    }

    public function testTamperedTagFailsToDecrypt(): void
    {
        $ciphertext = FieldEncryptor::encrypt('sensitive data');
        $raw = base64_decode($ciphertext, true);
        // Flip a byte inside the 16-byte GCM tag (bytes 12-27).
        $raw[15] = $raw[15] === "\x00" ? "\x01" : "\x00";
        $tampered = base64_encode($raw);

        $this->expectException(\RuntimeException::class);
        FieldEncryptor::decrypt($tampered);
    }

    public function testMalformedBase64FailsToDecrypt(): void
    {
        $this->expectException(\RuntimeException::class);
        FieldEncryptor::decrypt('too-short');
    }

    public function testHandlesMultibyteUnicode(): void
    {
        $value = "Amélie Müller — 日本語テスト";
        $ciphertext = FieldEncryptor::encrypt($value);

        self::assertSame($value, FieldEncryptor::decrypt($ciphertext));
    }
}
