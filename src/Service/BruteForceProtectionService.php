<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\User;
use Doctrine\DBAL\LockMode;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Port of apps.accounts.services.BruteForceProtectionService. Thresholds and
 * the progressive-delay schedule are copied verbatim from the Django
 * constants so the two backends behave identically during the migration.
 */
final class BruteForceProtectionService
{
    private const MAX_FAILED_ATTEMPTS = 5;
    private const LOCKOUT_DURATION_MINUTES = 30;
    private const CAPTCHA_THRESHOLD = 3;

    /** @var list<float> */
    private const PROGRESSIVE_DELAYS = [0.0, 1.0, 2.0, 4.0, 4.0];

    public function __construct(private readonly EntityManagerInterface $em)
    {
    }

    /**
     * @return array{0: bool, 1: int|null} [isLocked, secondsRemaining]
     */
    public function checkLockout(User $user): array
    {
        $lockedUntil = $user->getLockedUntil();
        if ($lockedUntil === null) {
            return [false, null];
        }

        $now = new \DateTimeImmutable();
        if ($lockedUntil > $now) {
            return [true, $lockedUntil->getTimestamp() - $now->getTimestamp() + 1];
        }

        return [false, null];
    }

    /**
     * @return array{0: bool, 1: int|null} [isRateLimited, secondsRemaining]
     */
    public function checkRateLimit(User $user): array
    {
        $nextAttemptAfter = $user->getNextAttemptAfter();
        if ($nextAttemptAfter === null) {
            return [false, null];
        }

        $now = new \DateTimeImmutable();
        if ($nextAttemptAfter > $now) {
            return [true, $nextAttemptAfter->getTimestamp() - $now->getTimestamp() + 1];
        }

        return [false, null];
    }

    public function isCaptchaRequired(User $user): bool
    {
        return $user->getFailedLoginAttempts() >= self::CAPTCHA_THRESHOLD;
    }

    private function computeProgressiveDelay(int $attempts): float
    {
        if ($attempts >= count(self::PROGRESSIVE_DELAYS)) {
            return self::PROGRESSIVE_DELAYS[array_key_last(self::PROGRESSIVE_DELAYS)];
        }

        return self::PROGRESSIVE_DELAYS[$attempts];
    }

    /**
     * Atomically increments the failed-attempt counter (pessimistic write
     * lock, mirroring Django's select_for_update()) and computes the new
     * rate-limit/lockout state.
     *
     * @return array{locked: bool, captchaRequired: bool, attempts: int, lockoutSeconds: int|null}
     */
    public function recordFailedAttempt(User $user): array
    {
        $locked = false;
        $lockoutSeconds = null;

        $this->em->wrapInTransaction(function () use ($user, &$locked, &$lockoutSeconds): void {
            /** @var User $lockedUser */
            $lockedUser = $this->em->find(User::class, $user->getId(), LockMode::PESSIMISTIC_WRITE);
            $lockedUser->setFailedLoginAttempts($lockedUser->getFailedLoginAttempts() + 1);

            $now = new \DateTimeImmutable();
            $delaySeconds = $this->computeProgressiveDelay($lockedUser->getFailedLoginAttempts());
            $lockedUser->setNextAttemptAfter(
                $delaySeconds > 0 ? $now->modify(sprintf('+%d seconds', (int) $delaySeconds)) : null,
            );

            if ($lockedUser->getFailedLoginAttempts() >= self::MAX_FAILED_ATTEMPTS && $lockedUser->getLockedUntil() === null) {
                $lockedUser->setLockedUntil($now->modify(sprintf('+%d minutes', self::LOCKOUT_DURATION_MINUTES)));
                $locked = true;
                $lockoutSeconds = self::LOCKOUT_DURATION_MINUTES * 60;
            }
        });

        $this->em->refresh($user);

        return [
            'locked' => $locked,
            'captchaRequired' => $this->isCaptchaRequired($user),
            'attempts' => $user->getFailedLoginAttempts(),
            'lockoutSeconds' => $lockoutSeconds,
        ];
    }

    public function resetAttempts(User $user): void
    {
        if ($user->getFailedLoginAttempts() > 0 || $user->getLockedUntil() !== null || $user->getNextAttemptAfter() !== null) {
            $user->setFailedLoginAttempts(0);
            $user->setLockedUntil(null);
            $user->setNextAttemptAfter(null);
            $this->em->flush();
        }
    }
}
