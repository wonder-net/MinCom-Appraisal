<?php

declare(strict_types=1);

namespace App\Tests\Unit\Service;

use App\Service\ProductionConfigValidator;
use PHPUnit\Framework\TestCase;

final class ProductionConfigValidatorTest extends TestCase
{
    private const VARS = ['APP_SECRET', 'TURNSTILE_SECRET_KEY', 'AUDIT_HMAC_KEY', 'FIELD_ENCRYPTION_KEY', 'JWT_PASSPHRASE', 'DATABASE_URL'];

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
        $_ENV['FIELD_ENCRYPTION_KEY'] = '18de00e22e7d18752b49426ebb0803f679f0371edc53878676bccec527320358';

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
        $_ENV['FIELD_ENCRYPTION_KEY'] = '18de00e22e7d18752b49426ebb0803f679f0371edc53878676bccec527320358';

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessageMatches('/FIELD_ENCRYPTION_KEY/');
        ProductionConfigValidator::validate('prod');
    }

    public function testRejectsKnownDevAuditHmacKey(): void
    {
        $this->setAllToRealValues();
        $_ENV['AUDIT_HMAC_KEY'] = 'ef01269c78be63ad7035f3b0fbd14cca42890f5266683d9c72b61077ad130aa';

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessageMatches('/AUDIT_HMAC_KEY/');
        ProductionConfigValidator::validate('prod');
    }

    public function testRejectsKnownDevJwtPassphrase(): void
    {
        $this->setAllToRealValues();
        $_ENV['JWT_PASSPHRASE'] = '2873b6b70610ca52cc8110965c1cdadac7f1f839d50e9fac8ab32381cd40c80e';

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
        $_ENV['DATABASE_URL'] = 'postgresql://mincom_symfony:devpassword@127.0.0.1:5432/mincom_appraisal_symfony';

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessageMatches('/DATABASE_URL/');
        ProductionConfigValidator::validate('prod');
    }

    public function testReportsAllErrorsAtOnce(): void
    {
        $_ENV['APP_SECRET'] = '';
        $_ENV['TURNSTILE_SECRET_KEY'] = '';
        $_ENV['AUDIT_HMAC_KEY'] = 'ef01269c78be63ad7035f3b0fbd14cca42890f5266683d9c72b61077ad130aa';
        $_ENV['FIELD_ENCRYPTION_KEY'] = '18de00e22e7d18752b49426ebb0803f679f0371edc53878676bccec527320358';
        $_ENV['JWT_PASSPHRASE'] = '2873b6b70610ca52cc8110965c1cdadac7f1f839d50e9fac8ab32381cd40c80e';
        $_ENV['DATABASE_URL'] = 'postgresql://x:devpassword@host/db';

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
        $_ENV['FIELD_ENCRYPTION_KEY'] = '18de00e22e7d18752b49426ebb0803f679f0371edc53878676bccec527320358';
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
        $_ENV['DATABASE_URL'] = 'postgresql://produser:realpassword@prod-db-host:5432/mincom_appraisal_symfony';
    }
}
