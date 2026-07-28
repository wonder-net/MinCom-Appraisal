<?php

declare(strict_types=1);

namespace App\Entity;

use App\Enum\UserBulkImportJobStatus;
use App\Repository\UserBulkImportJobRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.accounts.models.UserBulkImportJob (async path, <=10,000
 * rows). validationPreview/failedRows are encrypted at rest (AES-256-GCM,
 * transparent via App\Doctrine\Type\EncryptedJsonType), matching Django's
 * EncryptedJSONField — these carry employee names/emails/employee
 * numbers, which is exactly the PII this milestone's encryption covers.
 */
#[ORM\Entity(repositoryClass: UserBulkImportJobRepository::class)]
#[ORM\Table(name: 'user_bulk_import_job')]
class UserBulkImportJob
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $createdBy;

    #[ORM\Column(type: 'string', length: 255)]
    private string $originalFilename = '';

    #[ORM\Column(type: 'string', length: 500)]
    private string $storedFilePath = '';

    #[ORM\Column(type: 'string', length: 30, enumType: UserBulkImportJobStatus::class)]
    private UserBulkImportJobStatus $status;

    #[ORM\Column(type: 'integer')]
    private int $totalRows = 0;

    #[ORM\Column(type: 'integer')]
    private int $processedRows = 0;

    #[ORM\Column(type: 'integer')]
    private int $createdCount = 0;

    #[ORM\Column(type: 'integer')]
    private int $failedCount = 0;

    /** @var array<string, mixed>|null */
    #[ORM\Column(type: 'encrypted_json', nullable: true)]
    private ?array $validationPreview = null;

    /** @var list<array<string, mixed>>|null */
    #[ORM\Column(type: 'encrypted_json', nullable: true)]
    private ?array $failedRows = null;

    #[ORM\Column(type: 'text')]
    private string $errorMessage = '';

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $updatedAt;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $validationCompletedAt = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $commitStartedAt = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $commitCompletedAt = null;

    public function __construct(User $createdBy, string $originalFilename, string $storedFilePath)
    {
        $this->id = Uuid::v7();
        $this->createdBy = $createdBy;
        $this->originalFilename = $originalFilename;
        $this->storedFilePath = $storedFilePath;
        $this->status = UserBulkImportJobStatus::PENDING_VALIDATION;
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTimeImmutable();
    }

    #[ORM\PreUpdate]
    public function touch(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid
    {
        return $this->id;
    }

    public function getCreatedBy(): User
    {
        return $this->createdBy;
    }

    public function getOriginalFilename(): string
    {
        return $this->originalFilename;
    }

    public function getStoredFilePath(): string
    {
        return $this->storedFilePath;
    }

    public function setStoredFilePath(string $storedFilePath): void
    {
        $this->storedFilePath = $storedFilePath;
    }

    public function getStatus(): UserBulkImportJobStatus
    {
        return $this->status;
    }

    public function setStatus(UserBulkImportJobStatus $status): void
    {
        $this->status = $status;
    }

    public function getTotalRows(): int
    {
        return $this->totalRows;
    }

    public function setTotalRows(int $totalRows): void
    {
        $this->totalRows = $totalRows;
    }

    public function getProcessedRows(): int
    {
        return $this->processedRows;
    }

    public function setProcessedRows(int $processedRows): void
    {
        $this->processedRows = $processedRows;
    }

    public function getCreatedCount(): int
    {
        return $this->createdCount;
    }

    public function setCreatedCount(int $createdCount): void
    {
        $this->createdCount = $createdCount;
    }

    public function getFailedCount(): int
    {
        return $this->failedCount;
    }

    public function setFailedCount(int $failedCount): void
    {
        $this->failedCount = $failedCount;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function getValidationPreview(): ?array
    {
        return $this->validationPreview;
    }

    /**
     * @param array<string, mixed>|null $validationPreview
     */
    public function setValidationPreview(?array $validationPreview): void
    {
        $this->validationPreview = $validationPreview;
    }

    /**
     * @return list<array<string, mixed>>|null
     */
    public function getFailedRows(): ?array
    {
        return $this->failedRows;
    }

    /**
     * @param list<array<string, mixed>>|null $failedRows
     */
    public function setFailedRows(?array $failedRows): void
    {
        $this->failedRows = $failedRows;
    }

    public function getErrorMessage(): string
    {
        return $this->errorMessage;
    }

    public function setErrorMessage(string $errorMessage): void
    {
        $this->errorMessage = $errorMessage;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }

    public function getValidationCompletedAt(): ?\DateTimeImmutable
    {
        return $this->validationCompletedAt;
    }

    public function setValidationCompletedAt(?\DateTimeImmutable $validationCompletedAt): void
    {
        $this->validationCompletedAt = $validationCompletedAt;
    }

    public function getCommitStartedAt(): ?\DateTimeImmutable
    {
        return $this->commitStartedAt;
    }

    public function setCommitStartedAt(?\DateTimeImmutable $commitStartedAt): void
    {
        $this->commitStartedAt = $commitStartedAt;
    }

    public function getCommitCompletedAt(): ?\DateTimeImmutable
    {
        return $this->commitCompletedAt;
    }

    public function setCommitCompletedAt(?\DateTimeImmutable $commitCompletedAt): void
    {
        $this->commitCompletedAt = $commitCompletedAt;
    }
}
