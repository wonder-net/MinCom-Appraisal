<?php

declare(strict_types=1);

namespace App\Tests\Unit\Service;

use App\Service\ProductionConfigValidator;
use PHPUnit\Framework\TestCase;

final class ProductionConfigValidatorTest extends TestCase
{
    private const VARS = ['APP_SECRET', 'TURNSTILE_SECRET_KEY', 'AUDIT_HMAC_KEY', 'FIELD_ENCRYPTION_KEY', 'JWT_PASSPHRASE', 'DATABASE_URL', 'MAILER_DSN'];

    /** @var array<string, string|null> */
    private array $originalEnv = [];

    private mixed $originalArgv1 = null;

    protected function setUp(): void
    {
        foreach (self::VARS as $var) {
            $this->originalEnv[$var] = $_ENV[$var] ?? null;
        }
        $this->originalArgv1 = $_SERVER['argv'][1] ?? null;
    }

    protected function tearDown(): void
    {
        foreach ($this->originalEnv as $var => $value) {
            if ($value === null) {
                unset($_ENV[$var]);
            } else {
                $_ENV[$var] = $value;
            }
        }
        if ($this->originalArgv1 === null) {
            unset($_SERVER['argv'][1]);
        } else {
            $_SERVER['argv'][1] = $this->originalArgv1;
        }
    }

    public function testDoesNothingOutsideProd(): void
    {
        $_ENV['APP_SECRET'] = '';
        $_ENV['FIELD_ENCRYPTION_KEY'] = '65d9f447d28987836c7970841687a076586c8ad0d8c9cdd80e99cab88df7b820';

        // No exception — dev/test are allowed to use the committed placeholders.
        ProductionConfigValidator::validate('dev');
        ProductionConfigValidator::validate('test');
        $this->addToAssertionCount(2);
    }

    public function testPassesInProdWithRealValuesConfigured(): void
    {
        $this->setAllToRealValues();

        ProductionConfigValidator::validate('prod');
        $this->addToAssertionCount(1);
    }

    public function testRejectsKnownDevFieldEncryptionKey(): void
    {
        $this->setAllToRealValues();
        $_ENV['FIELD_ENCRYPTION_KEY'] = '65d9f447d28987836c7970841687a076586c8ad0d8c9cdd80e99cab88df7b820';

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessageMatches('/FIELD_ENCRYPTION_KEY/');
        ProductionConfigValidator::validate('prod');
    }

    public function testRejectsKnownDevAuditHmacKey(): void
    {
        $this->setAllToRealValues();
        $_ENV['AUDIT_HMAC_KEY'] = 'e7e927e17e929208cbc2361de6158dedcae17932d122b3b0dd9e204a9cf420fe';

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessageMatches('/AUDIT_HMAC_KEY/');
        ProductionConfigValidator::validate('prod');
    }

    public function testRejectsKnownDevJwtPassphrase(): void
    {
        $this->setAllToRealValues();
        $_ENV['JWT_PASSPHRASE'] = 'ae01efc3ab9ca4819f179b2eb53a8fdcea80b3b42bc5e41a8beb6443eddf087b';

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessageMatches('/JWT_PASSPHRASE/');
        ProductionConfigValidator::validate('prod');
    }

    public function testRejectsEmptyAppSecret(): void
    {
        $this->setAllToRealValues();
        $_ENV['APP_SECRET'] = '';

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessageMatches('/APP_SECRET/');
        ProductionConfigValidator::validate('prod');
    }

    public function testRejectsEmptyTurnstileSecretKey(): void
    {
        $this->setAllToRealValues();
        $_ENV['TURNSTILE_SECRET_KEY'] = '';

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessageMatches('/TURNSTILE_SECRET_KEY/');
        ProductionConfigValidator::validate('prod');
    }

    public function testRejectsDevDatabasePassword(): void
    {
        $this->setAllToRealValues();
        $_ENV['DATABASE_URL'] = 'mysql://mincom_symfony:devpassword@127.0.0.1:3306/mincom_appraisal_symfony';

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessageMatches('/DATABASE_URL/');
        ProductionConfigValidator::validate('prod');
    }

    public function testRejectsUnfilledReplaceWithPlaceholder(): void
    {
        // Real crypto secrets configured correctly (would otherwise pass)
        // but an external-service credential from .env.prod.local.dist
        // was never actually filled in — found by testing this validator
        // against a freshly-generated .env.prod.local that had exactly
        // this shape: MUST_BE_NON_EMPTY's blank check alone doesn't catch
        // it, since a placeholder string isn't blank.
        $this->setAllToRealValues();
        $_ENV['MAILER_DSN'] = 'smtp://REPLACE_WITH_POSTMARK_TOKEN:REPLACE_WITH_POSTMARK_TOKEN@smtp.postmarkapp.com:587';

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessageMatches('/MAILER_DSN.*REPLACE_WITH_/');
        ProductionConfigValidator::validate('prod');
    }

    public function testReportsAllErrorsAtOnce(): void
    {
        $_ENV['APP_SECRET'] = '';
        $_ENV['TURNSTILE_SECRET_KEY'] = '';
        $_ENV['AUDIT_HMAC_KEY'] = 'e7e927e17e929208cbc2361de6158dedcae17932d122b3b0dd9e204a9cf420fe';
        $_ENV['FIELD_ENCRYPTION_KEY'] = '65d9f447d28987836c7970841687a076586c8ad0d8c9cdd80e99cab88df7b820';
        $_ENV['JWT_PASSPHRASE'] = 'ae01efc3ab9ca4819f179b2eb53a8fdcea80b3b42bc5e41a8beb6443eddf087b';
        $_ENV['DATABASE_URL'] = 'mysql://x:devpassword@host/db';

        try {
            ProductionConfigValidator::validate('prod');
            self::fail('Expected a RuntimeException');
        } catch (\RuntimeException $e) {
            foreach (['APP_SECRET', 'TURNSTILE_SECRET_KEY', 'AUDIT_HMAC_KEY', 'FIELD_ENCRYPTION_KEY', 'JWT_PASSPHRASE', 'DATABASE_URL'] as $var) {
                self::assertStringContainsString($var, $e->getMessage());
            }
        }
    }

    /**
     * @dataProvider buildTimeCommandProvider
     */
    public function testSkipsValidationForBuildTimeCommands(string $command): void
    {
        // Intentionally leaves every secret at its insecure/blank state —
        // this is the exact condition the `prod` Docker stage builds
        // under (docker/php/Dockerfile's cache:warmup/assets:install
        // steps run before .env.prod.local exists on the real VM).
        $_ENV['APP_SECRET'] = '';
        $_ENV['FIELD_ENCRYPTION_KEY'] = '65d9f447d28987836c7970841687a076586c8ad0d8c9cdd80e99cab88df7b820';
        $_SERVER['argv'][1] = $command;

        ProductionConfigValidator::validate('prod');
        $this->addToAssertionCount(1);
    }

    /**
     * @return iterable<string, array{0: string}>
     */
    public static function buildTimeCommandProvider(): iterable
    {
        yield 'cache:warmup' => ['cache:warmup'];
        yield 'cache:clear' => ['cache:clear'];
        yield 'assets:install' => ['assets:install'];
    }

    public function testDoesNotSkipValidationForOtherCommands(): void
    {
        $_ENV['APP_SECRET'] = '';
        $_SERVER['argv'][1] = 'about';

        $this->expectException(\RuntimeException::class);
        ProductionConfigValidator::validate('prod');
    }

    private function setAllToRealValues(): void
    {
        $_ENV['APP_SECRET'] = 'a-real-generated-secret';
        $_ENV['TURNSTILE_SECRET_KEY'] = 'a-real-turnstile-secret';
        $_ENV['AUDIT_HMAC_KEY'] = str_repeat('a1', 32);
        $_ENV['FIELD_ENCRYPTION_KEY'] = str_repeat('b2', 32);
        $_ENV['JWT_PASSPHRASE'] = 'a-real-jwt-passphrase';
        $_ENV['DATABASE_URL'] = 'mysql://produser:realpassword@prod-db-host:3306/mincom_appraisal_symfony';
    }
}
