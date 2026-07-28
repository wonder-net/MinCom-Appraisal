<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\RecoveryCode;
use App\Entity\User;
use App\Repository\RecoveryCodeRepository;
use Doctrine\DBAL\LockMode;
use Doctrine\ORM\EntityManagerInterface;
use OTPHP\TOTP;
use Psr\Log\LoggerInterface;

/**
 * Port of apps.accounts.mfa.MFAService: RFC 6238 TOTP (30s period, 6
 * digits, SHA-1, +/- 1 step tolerance) plus bcrypt-hashed single-use
 * recovery codes. TOTP replay protection is not implemented here either —
 * same tracked gap as the Django module's own docblock.
 */
final class MfaService
{
    private const ISSUER = 'MINCOM';
    private const RECOVERY_CODE_COUNT = 10;

    public function __construct(
        private readonly RecoveryCodeRepository $recoveryCodes,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
        private readonly AuditService $auditService,
    ) {
    }

    public function generateSecret(): string
    {
        return TOTP::generate()->getSecret();
    }

    public function getProvisioningUri(User $user, string $secret): string
    {
        $totp = TOTP::createFromSecret($secret);
        $totp->setLabel($user->getEmail());
        $totp->setIssuer(self::ISSUER);

        return $totp->getProvisioningUri();
    }

    /**
     * Mirrors pyotp's valid_window=1: accept the code for the previous,
     * current, or next whole 30s step. Deliberately NOT using otphp's own
     * `leeway` parameter — that shifts the check timestamp by a number of
     * *seconds* rather than whole periods, so its tolerance window varies
     * depending on where "now" falls inside the current step (and otphp
     * additionally rejects any leeway >= the period, i.e. >= 30 here).
     * Checking three explicit whole-step timestamps reproduces pyotp's
     * behaviour exactly regardless of when in the step "now" lands.
     */
    public function verifyTotp(string $secret, string $code): bool
    {
        $totp = TOTP::createFromSecret($secret);
        $now = time();
        $period = $totp->getPeriod();

        foreach ([-1, 0, 1] as $stepOffset) {
            if ($totp->verify($code, $now + $stepOffset * $period)) {
                return true;
            }
        }

        return false;
    }

    private function generateRecoveryCode(): string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        $chars = '';
        for ($i = 0; $i < 12; ++$i) {
            $chars .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }

        return substr($chars, 0, 4).'-'.substr($chars, 4, 4).'-'.substr($chars, 8, 4);
    }

    private function normalizeRecoveryCode(string $plaintext): string
    {
        return strtoupper(str_replace('-', '', $plaintext));
    }

    private function hashRecoveryCode(string $plaintext): string
    {
        return password_hash($this->normalizeRecoveryCode($plaintext), PASSWORD_BCRYPT);
    }

    /**
     * @return list<string> plaintext codes — shown to the user exactly once
     */
    public function generateRecoveryCodes(User $user, int $count = self::RECOVERY_CODE_COUNT): array
    {
        $this->recoveryCodes->deleteUnusedForUser($user);

        $plaintextCodes = [];
        for ($i = 0; $i < $count; ++$i) {
            $code = $this->generateRecoveryCode();
            $plaintextCodes[] = $code;
            $this->em->persist(new RecoveryCode($user, $this->hashRecoveryCode($code)));
        }
        $this->em->flush();

        $this->logger->info('Generated {count} recovery codes for user {id}.', [
            'count' => $count,
            'id' => (string) $user->getId(),
        ]);
        $this->auditService->log('user.recovery_codes_generated', 'User', $user->getId(), $user, null, ['recovery_code_count' => $count]);

        return $plaintextCodes;
    }

    public function verifyRecoveryCode(User $user, string $code): bool
    {
        $normalized = $this->normalizeRecoveryCode($code);

        $verified = false;
        $usedRecoveryCodeId = null;

        $this->em->wrapInTransaction(function () use ($user, $normalized, &$verified, &$usedRecoveryCodeId): void {
            foreach ($this->recoveryCodes->findUnusedForUser($user) as $recoveryCode) {
                $this->em->lock($recoveryCode, LockMode::PESSIMISTIC_WRITE);

                if (password_verify($normalized, $recoveryCode->getCodeHash())) {
                    $recoveryCode->markUsed(new \DateTimeImmutable());
                    $verified = true;
                    $usedRecoveryCodeId = $recoveryCode->getId();

                    $this->logger->info('Recovery code used for user {id}.', ['id' => (string) $user->getId()]);

                    return;
                }
            }
        });

        if ($verified) {
            $this->auditService->log('user.recovery_code_used', 'User', $user->getId(), $user, null, null, null, ['recovery_code_id' => (string) $usedRecoveryCodeId]);
        }

        if (!$verified) {
            $this->logger->info('Recovery code verification failed for user {id}.', ['id' => (string) $user->getId()]);
        }

        return $verified;
    }

    public function getRemainingRecoveryCodesCount(User $user): int
    {
        return $this->recoveryCodes->countUnusedForUser($user);
    }
}
