<?php

declare(strict_types=1);

namespace App\Entity;

use App\Enum\BulkImportJobStatus;
use App\Repository\BulkImportJobRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.accounts.models.BulkImportJob: the legacy synchronous
 * bulk-import path (<=500 rows). Ephemeral/operational — no soft delete.
 */
#[ORM\Entity(repositoryClass: BulkImportJobRepository::class)]
#[ORM\Table(name: 'bulk_import_job')]
class BulkImportJob
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $createdBy;

    #[ORM\Column(type: 'string', length: 20, enumType: BulkImportJobStatus::class)]
    private BulkImportJobStatus $status;

    #[ORM\Column(type: 'string', length: 500)]
    private string $filePath = '';

    #[ORM\Column(type: 'integer')]
    private int $totalRows = 0;

    #[ORM\Column(type: 'integer')]
    private int $createdCount = 0;

    #[ORM\Column(type: 'integer')]
    private int $failedCount = 0;

    /** @var list<array{row_number: int, error: string}> */
    #[ORM\Column(type: 'json')]
    private array $failedRows = [];

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $completedAt = null;

    public function __construct(User $createdBy)
    {
        $this->id = Uuid::v7();
        $this->createdBy = $createdBy;
        $this->status = BulkImportJobStatus::PENDING;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid
    {
        return $this->id;
    }

    public function getCreatedBy(): User
    {
        return $this->createdBy;
    }

    public function getStatus(): BulkImportJobStatus
    {
        return $this->status;
    }

    public function setStatus(BulkImportJobStatus $status): void
    {
        $this->status = $status;
    }

    public function getFilePath(): string
    {
        return $this->filePath;
    }

    public function setFilePath(string $filePath): void
    {
        $this->filePath = $filePath;
    }

    public function getTotalRows(): int
    {
        return $this->totalRows;
    }

    public function setTotalRows(int $totalRows): void
    {
        $this->totalRows = $totalRows;
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
     * @return list<array{row_number: int, error: string}>
     */
    public function getFailedRows(): array
    {
        return $this->failedRows;
    }

    /**
     * @param list<array{row_number: int, error: string}> $failedRows
     */
    public function setFailedRows(array $failedRows): void
    {
        $this->failedRows = $failedRows;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getCompletedAt(): ?\DateTimeImmutable
    {
        return $this->completedAt;
    }

    public function setCompletedAt(?\DateTimeImmutable $completedAt): void
    {
        $this->completedAt = $completedAt;
    }
}
