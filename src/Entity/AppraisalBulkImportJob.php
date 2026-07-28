<?php

declare(strict_types=1);

namespace App\Entity;

use App\Enum\AppraisalBulkImportJobStatus;
use App\Repository\AppraisalBulkImportJobRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.appraisals.models.AppraisalBulkImportJob. Tracks progress
 * and results of a bulk appraisal import from .xls/.zip. Consuming
 * controllers land in Milestone 10e — this entity is built now for
 * schema completeness alongside the rest of the app's tables.
 */
#[ORM\Entity(repositoryClass: AppraisalBulkImportJobRepository::class)]
#[ORM\Table(name: 'appraisal_bulk_import_job')]
class AppraisalBulkImportJob
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'created_by_id', nullable: false, onDelete: 'CASCADE')]
    private User $createdBy;

    #[ORM\ManyToOne(targetEntity: AppraisalCycle::class)]
    #[ORM\JoinColumn(name: 'cycle_id', nullable: true, onDelete: 'CASCADE')]
    private ?AppraisalCycle $cycle = null;

    #[ORM\Column(type: 'string', length: 20, enumType: AppraisalBulkImportJobStatus::class)]
    private AppraisalBulkImportJobStatus $status;

    #[ORM\Column(type: 'string', length: 30)]
    private string $targetStatus;

    #[ORM\Column(type: 'string', length: 500)]
    private string $filePath = '';

    #[ORM\Column(type: 'integer')]
    private int $totalFiles = 0;

    #[ORM\Column(type: 'integer')]
    private int $importedCount = 0;

    #[ORM\Column(type: 'integer')]
    private int $failedCount = 0;

    /**
     * @var list<array{filename: string, error: string}>
     */
    #[ORM\Column(type: 'json')]
    private array $failedFiles = [];

    /**
     * @var array<string, mixed>
     */
    #[ORM\Column(type: 'json')]
    private array $previewData = [];

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $completedAt = null;

    public function __construct(User $createdBy, ?AppraisalCycle $cycle, string $targetStatus)
    {
        $this->id = Uuid::v7();
        $this->createdBy = $createdBy;
        $this->cycle = $cycle;
        $this->targetStatus = $targetStatus;
        $this->status = AppraisalBulkImportJobStatus::PENDING;
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

    public function getCycle(): ?AppraisalCycle
    {
        return $this->cycle;
    }

    public function getStatus(): AppraisalBulkImportJobStatus
    {
        return $this->status;
    }

    public function setStatus(AppraisalBulkImportJobStatus $status): void
    {
        $this->status = $status;
    }

    public function getTargetStatus(): string
    {
        return $this->targetStatus;
    }

    public function getFilePath(): string
    {
        return $this->filePath;
    }

    public function setFilePath(string $filePath): void
    {
        $this->filePath = $filePath;
    }

    public function getTotalFiles(): int
    {
        return $this->totalFiles;
    }

    public function setTotalFiles(int $totalFiles): void
    {
        $this->totalFiles = $totalFiles;
    }

    public function getImportedCount(): int
    {
        return $this->importedCount;
    }

    public function setImportedCount(int $importedCount): void
    {
        $this->importedCount = $importedCount;
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
     * @return list<array{filename: string, error: string}>
     */
    public function getFailedFiles(): array
    {
        return $this->failedFiles;
    }

    /**
     * @param list<array{filename: string, error: string}> $failedFiles
     */
    public function setFailedFiles(array $failedFiles): void
    {
        $this->failedFiles = $failedFiles;
    }

    /**
     * @return array<string, mixed>
     */
    public function getPreviewData(): array
    {
        return $this->previewData;
    }

    /**
     * @param array<string, mixed> $previewData
     */
    public function setPreviewData(array $previewData): void
    {
        $this->previewData = $previewData;
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
