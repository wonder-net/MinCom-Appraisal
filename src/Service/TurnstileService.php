<?php

declare(strict_types=1);

namespace App\Service;

use Psr\Log\LoggerInterface;
use Symfony\Component\HttpClient\Exception\TransportException;
use Symfony\Contracts\HttpClient\Exception\ExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Port of apps.accounts.captcha.TurnstileService. Dev mode (empty secret key)
 * skips verification entirely; any network/API error fails closed.
 */
final class TurnstileService
{
    private const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
    private const TIMEOUT_SECONDS = 5;

    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly LoggerInterface $logger,
        private readonly string $secretKey,
    ) {
    }

    public function isConfigured(): bool
    {
        return $this->secretKey !== '';
    }

    public function verifyToken(string $token, string $ipAddress): bool
    {
        if (!$this->isConfigured()) {
            $this->logger->debug('Turnstile CAPTCHA verification skipped: TURNSTILE_SECRET_KEY is not configured (dev mode).');

            return true;
        }

        try {
            $response = $this->httpClient->request('POST', self::VERIFY_URL, [
                'body' => [
                    'secret' => $this->secretKey,
                    'response' => $token,
                    'remoteip' => $ipAddress,
                ],
                'timeout' => self::TIMEOUT_SECONDS,
            ]);

            if ($response->getStatusCode() !== 200) {
                $this->logger->warning('Turnstile API returned non-200 status: {status}', ['status' => $response->getStatusCode()]);

                return false;
            }

            $result = $response->toArray(false);
            $success = (bool) ($result['success'] ?? false);

            if (!$success) {
                $this->logger->info('Turnstile CAPTCHA verification failed: error_codes={codes}', [
                    'codes' => implode(',', $result['error-codes'] ?? []),
                ]);
            }

            return $success;
        } catch (TransportException $exc) {
            $this->logger->warning('Turnstile API request timed out or failed to connect: {message}', ['message' => $exc->getMessage()]);

            return false;
        } catch (ExceptionInterface $exc) {
            $this->logger->warning('Turnstile API request failed: {message}', ['message' => $exc->getMessage()]);

            return false;
        }
    }
}
