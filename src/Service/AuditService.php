<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\AuditLog;
use App\Entity\User;
use App\Repository\AuditLogRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.audit.services.AuditService — the canonical way to
 * create AuditLog entries. Computes SHA-256 hashes of old/new state,
 * the hash-chain `previousHash`, and the `entryHmac`, then persists.
 *
 * All state changes across the app should call `log()` rather than
 * constructing AuditLog directly, exactly as in Django.
 *
 * Every entry's `metadata` is seeded with the ambient
 * correlation_id/request_path/request_method (see AuditRequestContext)
 * before the caller's own `$metadata` is layered on top — so a caller
 * can still override any of those three keys explicitly, but doesn't
 * have to supply them just to get them recorded.
 */
final class AuditService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly AuditLogRepository $auditLogs,
        private readonly string $auditHmacKey,
        private readonly AuditRequestContext $requestContext,
    ) {
    }

    /**
     * @param User|Uuid|string|null $user Accepted as a User entity, a Uuid, a UUID string, or null for system actions
     * @param array<string, mixed>|null $oldState
     * @param array<string, mixed>|null $newState
     * @param array<string, mixed>|null $metadata
     */
    public function log(
        string $action,
        string $resourceType,
        Uuid $resourceId,
        User|Uuid|string|null $user = null,
        ?array $oldState = null,
        ?array $newState = null,
        ?string $ipAddress = null,
        ?array $metadata = null,
    ): AuditLog {
        return $this->em->wrapInTransaction(function () use ($action, $resourceType, $resourceId, $user, $oldState, $newState, $ipAddress, $metadata): AuditLog {
            // Doctrine's `datetime_immutable` type maps to Postgres
            // TIMESTAMP(0) (whole-second precision) by default, so the
            // timestamp used to compute the HMAC/chain hash here must
            // already be truncated to whole seconds — otherwise a
            // later reload-and-reverify (verifyChain) would recompute
            // against a different (truncated) value than what was
            // used at creation time and spuriously report tampering.
            $now = new \DateTimeImmutable();
            $timestamp = \DateTimeImmutable::createFromFormat('U', (string) $now->getTimestamp());
            \assert($timestamp instanceof \DateTimeImmutable);

            $lastEntry = $this->auditLogs->findLastForUpdate();
            $previousHash = $lastEntry !== null ? $lastEntry->computeChainHash() : AuditLog::GENESIS_HASH;

            $entry = new AuditLog(
                $action,
                $resourceType,
                $resourceId,
                $this->coerceUserId($user),
                $this->hashState($oldState),
                $this->hashState($newState),
                $ipAddress,
                [...$this->requestContext->toMetadata(), ...($metadata ?? [])],
                $timestamp,
                $previousHash,
                '',
            );
            $entry->finalizeEntryHmac($entry->computeExpectedHmac($this->auditHmacKey));

            $this->em->persist($entry);
            $this->em->flush();

            return $entry;
        });
    }

    private function coerceUserId(User|Uuid|string|null $user): ?Uuid
    {
        if ($user === null) {
            return null;
        }
        if ($user instanceof Uuid) {
            return $user;
        }
        if (is_string($user)) {
            return Uuid::fromString($user);
        }

        return $user->getId();
    }

    /**
     * @param array<string, mixed>|null $state
     */
    private function hashState(?array $state): string
    {
        if ($state === null) {
            return '';
        }

        $this->recursiveKsort($state);

        return hash('sha256', json_encode($state, \JSON_THROW_ON_ERROR));
    }

    /**
     * @param array<string, mixed> $array
     */
    private function recursiveKsort(array &$array): void
    {
        ksort($array);
        foreach ($array as &$value) {
            if (is_array($value)) {
                $this->recursiveKsort($value);
            }
        }
    }
}
