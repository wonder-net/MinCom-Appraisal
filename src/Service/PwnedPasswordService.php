<?php

declare(strict_types=1);

namespace App\Service;

use Psr\Log\LoggerInterface;
use Symfony\Contracts\HttpClient\Exception\ExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Port of apps.accounts.validators.HaveIBeenPwnedValidator. Uses the HIBP
 * k-Anonymity API: only the first 5 hex chars of the password's SHA-1 hash
 * are ever sent. Fails OPEN (allows the password through) on any API
 * error/timeout/non-200, so a third-party outage never blocks password
 * changes — logged as a warning either way.
 */
final class PwnedPasswordService
{
    private const API_URL = 'https://api.pwnedpasswords.com/range/%s';
    private const TIMEOUT_SECONDS = 3;

    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function isBreached(string $password): bool
    {
        $sha1 = strtoupper(sha1($password));
        $prefix = substr($sha1, 0, 5);
        $suffix = substr($sha1, 5);

        try {
            $response = $this->httpClient->request('GET', sprintf(self::API_URL, $prefix), [
                'timeout' => self::TIMEOUT_SECONDS,
                'headers' => ['User-Agent' => 'MINCOM-Appraisal-PasswordCheck'],
            ]);

            if ($response->getStatusCode() !== 200) {
                $this->logger->warning('HaveIBeenPwned API returned status {status} — skipping breach check (fail-open).', [
                    'status' => $response->getStatusCode(),
                ]);

                return false;
            }

            $body = $response->getContent(false);
        } catch (ExceptionInterface $exc) {
            $this->logger->warning('HaveIBeenPwned API unreachable — skipping breach check (fail-open): {message}', [
                'message' => $exc->getMessage(),
            ]);

            return false;
        }

        foreach (explode("\n", $body) as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }

            [$responseSuffix] = explode(':', $line, 2);
            if ($responseSuffix === $suffix) {
                return true;
            }
        }

        return false;
    }
}
