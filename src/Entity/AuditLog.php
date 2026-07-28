<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\AuditLogRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.audit.models.AuditLog: an immutable, append-only audit
 * log entry with hash-chain integrity and HMAC-SHA256 tamper detection.
 *
 * `userId` is stored as a raw UUID (NOT a Doctrine association to
 * User) so that audit entries survive user deletion intact and
 * preserve the immutable evidence trail — mirrors Django's deliberate
 * choice of a plain UUID column over a live FK.
 *
 * Append-only is enforced three ways (matching Django's model +
 * manager + DB-trigger layers):
 * 1. This entity exposes no setters at all — every field is set once
 *    in the constructor, so there is no code path that could mutate a
 *    managed instance.
 * 2. `#[ORM\PreUpdate]`/`#[ORM\PreRemove]` throw unconditionally, as a
 *    defensive backstop in case a future change introduces a mutation
 *    path Doctrine's UnitOfWork would otherwise silently flush.
 * 3. A raw-SQL Postgres trigger (see the creating migration) rejects
 *    UPDATE/DELETE at the database level — the strongest guarantee,
 *    matching Django's `prevent_audit_modification()` trigger.
 *
 * Hash chain rules (see AuditService for entry creation):
 * - Genesis entry (first ever): previousHash = SHA-256("")
 * - Subsequent entries: previousHash = computeEntryHash(lastEntry)
 * - entryHmac = HMAC-SHA256(key=AUDIT_HMAC_KEY, message=id+action+
 *   resourceType+resourceId+timestamp(ATOM)+previousHash)
 */
#[ORM\Entity(repositoryClass: AuditLogRepository::class)]
#[ORM\Table(name: 'audit_log')]
#[ORM\Index(columns: ['user_id'], name: 'idx_audit_log_user_id')]
#[ORM\Index(columns: ['action'], name: 'idx_audit_log_action')]
#[ORM\Index(columns: ['resource_type'], name: 'idx_audit_log_resource_type')]
#[ORM\Index(columns: ['resource_id'], name: 'idx_audit_log_resource_id')]
#[ORM\Index(columns: ['timestamp'], name: 'idx_audit_log_timestamp')]
class AuditLog
{
    /** SHA-256 of the empty string — previousHash for the very first entry in the chain. */
    public const GENESIS_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\Column(type: 'uuid', nullable: true)]
    private ?Uuid $userId;

    #[ORM\Column(type: 'string', length: 100)]
    private string $action;

    #[ORM\Column(type: 'string', length: 100)]
    private string $resourceType;

    #[ORM\Column(type: 'uuid')]
    private Uuid $resourceId;

    #[ORM\Column(type: 'string', length: 64)]
    private string $oldValueHash;

    #[ORM\Column(type: 'string', length: 64)]
    private string $newValueHash;

    /** @var array<string, mixed> */
    #[ORM\Column(type: 'json')]
    private array $metadata;

    #[ORM\Column(type: 'string', length: 45, nullable: true)]
    private ?string $ipAddress;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $timestamp;

    #[ORM\Column(type: 'string', length: 64)]
    private string $previousHash;

    #[ORM\Column(type: 'string', length: 64)]
    private string $entryHmac;

    /**
     * @param array<string, mixed> $metadata
     */
    public function __construct(
        string $action,
        string $resourceType,
        Uuid $resourceId,
        ?Uuid $userId,
        string $oldValueHash,
        string $newValueHash,
        ?string $ipAddress,
        array $metadata,
        \DateTimeImmutable $timestamp,
        string $previousHash,
        string $entryHmac,
    ) {
        $this->id = Uuid::v7();
        $this->action = $action;
        $this->resourceType = $resourceType;
        $this->resourceId = $resourceId;
        $this->userId = $userId;
        $this->oldValueHash = $oldValueHash;
        $this->newValueHash = $newValueHash;
        $this->ipAddress = $ipAddress;
        $this->metadata = $metadata;
        $this->timestamp = $timestamp;
        $this->previousHash = $previousHash;
        $this->entryHmac = $entryHmac;
    }

    /**
     * One-time HMAC finalisation, called only by AuditService
     * immediately after construction (before persist) — the HMAC
     * message includes this entry's own `id`, which is only known
     * once the constructor has run, so it can't be computed and
     * passed in as a constructor argument. This is not a general
     * mutation path: it's meaningless (and harmless) to call again,
     * since entryHmac is only ever read after the entry is persisted.
     */
    public function finalizeEntryHmac(string $hmac): void
    {
        $this->entryHmac = $hmac;
    }

    #[ORM\PreUpdate]
    public function guardAgainstUpdate(): never
    {
        throw new \LogicException('AuditLog entries cannot be modified.');
    }

    #[ORM\PreRemove]
    public function guardAgainstRemoval(): never
    {
        throw new \LogicException('AuditLog entries cannot be deleted.');
    }

    public function getId(): Uuid
    {
        return $this->id;
    }

    public function getUserId(): ?Uuid
    {
        return $this->userId;
    }

    public function getAction(): string
    {
        return $this->action;
    }

    public function getResourceType(): string
    {
        return $this->resourceType;
    }

    public function getResourceId(): Uuid
    {
        return $this->resourceId;
    }

    public function getOldValueHash(): string
    {
        return $this->oldValueHash;
    }

    public function getNewValueHash(): string
    {
        return $this->newValueHash;
    }

    /**
     * @return array<string, mixed>
     */
    public function getMetadata(): array
    {
        return $this->metadata;
    }

    public function getIpAddress(): ?string
    {
        return $this->ipAddress;
    }

    public function getTimestamp(): \DateTimeImmutable
    {
        return $this->timestamp;
    }

    public function getPreviousHash(): string
    {
        return $this->previousHash;
    }

    public function getEntryHmac(): string
    {
        return $this->entryHmac;
    }

    /**
     * Port of AuditLog._compute_hmac — recomputes what entryHmac
     * *should* be for this entry, given a key. Used both at creation
     * time (AuditService) and for tamper verification (verifyChain).
     */
    public function computeExpectedHmac(string $hmacKey): string
    {
        $message = $this->id.$this->action.$this->resourceType.$this->resourceId.$this->timestamp->format(\DateTimeInterface::ATOM).$this->previousHash;

        return hash_hmac('sha256', $message, $hmacKey);
    }

    /**
     * Port of AuditLog.compute_entry_hash: the SHA-256 hash used as
     * the next entry's previousHash, chaining this entry into the log.
     */
    public function computeChainHash(): string
    {
        $data = $this->id.$this->timestamp->format(\DateTimeInterface::ATOM).$this->action.$this->entryHmac;

        return hash('sha256', $data);
    }
}
