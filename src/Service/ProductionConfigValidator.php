<?php

declare(strict_types=1);

namespace App\Service;

/**
 * Port of backend/utils/encryption.py's validate_encryption_key(),
 * generalised to every secret this app has grown across the whole
 * rewrite (FIELD_ENCRYPTION_KEY/AUDIT_HMAC_KEY/JWT_PASSPHRASE weren't
 * all introduced at once, so Django's single-key check became several
 * as milestones landed). Called from Kernel::boot() so a `prod`
 * environment booting with a known dev-only secret — or a blank one —
 * fails immediately and loudly (a RuntimeException on every request/
 * command) rather than silently running with values that are public
 * knowledge (checked into this very repo's `.env`).
 *
 * Deliberately NOT run for dev/test: those environments are supposed
 * to use the committed placeholder values — that's the whole point of
 * committing them.
 *
 * Also deliberately skipped for `cache:warmup`/`cache:clear`: the
 * `prod` Docker image stage runs `cache:warmup --env=prod` at *build*
 * time (see docker/php/Dockerfile), before any real secret exists —
 * `.env.prod.local` lives on the VM and is never baked into the image,
 * by design. Booting the kernel to compile/warm the container isn't
 * "running in production" the way serving a real request or consuming
 * a real queue message is, so it's exempted rather than forcing the
 * Docker build to fake real secrets just to get past this check.
 */
final class ProductionConfigValidator
{
    /**
     * Known dev-only placeholder values committed in `.env`. If any of
     * these are still active under APP_ENV=prod, the real secret was
     * never generated for this deployment.
     */
    private const KNOWN_DEV_VALUES = [
        'AUDIT_HMAC_KEY' => 'ef01269c78be63ad7035f3b0fbd14cca42890f5266683d9c72b61077ad130aa',
        'FIELD_ENCRYPTION_KEY' => '18de00e22e7d18752b49426ebb0803f679f0371edc53878676bccec527320358',
        'JWT_PASSPHRASE' => '2873b6b70610ca52cc8110965c1cdadac7f1f839d50e9fac8ab32381cd40c80e',
    ];

    /**
     * Vars that must simply be non-empty in prod (Django equivalents:
     * SECRET_KEY, TURNSTILE_SECRET_KEY — both required at startup
     * there too, via the same fail-fast philosophy).
     */
    private const MUST_BE_NON_EMPTY = ['APP_SECRET', 'TURNSTILE_SECRET_KEY'];

    /**
     * Commands the `prod` Docker image stage runs at *build* time (see
     * docker/php/Dockerfile) — before any real secret exists.
     *
     * @var list<string>
     */
    private const BUILD_TIME_COMMANDS = ['cache:warmup', 'cache:clear', 'assets:install'];

    public static function validate(string $appEnv): void
    {
        if ($appEnv !== 'prod' || self::isBuildTimeCommand()) {
            return;
        }

        $errors = [];

        foreach (self::KNOWN_DEV_VALUES as $var => $devValue) {
            if (self::env($var) === $devValue) {
                $errors[] = sprintf('%s is still set to the dev-only placeholder value committed in .env — generate a real one (see .env.prod.local.dist).', $var);
            }
        }

        foreach (self::MUST_BE_NON_EMPTY as $var) {
            if (self::env($var) === '') {
                $errors[] = sprintf('%s must be set in production (see .env.prod.local.dist).', $var);
            }
        }

        if (str_contains(self::env('DATABASE_URL'), 'devpassword')) {
            $errors[] = 'DATABASE_URL still contains the dev database password — point it at the real production database.';
        }

        if ($errors !== []) {
            throw new \RuntimeException(
                "Refusing to boot with APP_ENV=prod: insecure or missing configuration:\n  - ".implode("\n  - ", $errors),
            );
        }
    }

    private static function env(string $name): string
    {
        $value = $_ENV[$name] ?? $_SERVER[$name] ?? getenv($name);

        return is_string($value) ? $value : '';
    }

    private static function isBuildTimeCommand(): bool
    {
        if (\PHP_SAPI !== 'cli' || !isset($_SERVER['argv'][1])) {
            return false;
        }

        return in_array($_SERVER['argv'][1], self::BUILD_TIME_COMMANDS, true);
    }
}
