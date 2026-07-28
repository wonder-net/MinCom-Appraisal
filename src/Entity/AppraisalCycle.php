<?php

declare(strict_types=1);

namespace App\Entity;

use App\Enum\AppraisalCycleStatus;
use App\Repository\AppraisalCycleRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.appraisals.models.AppraisalCycle. Lifecycle: DRAFT -> ACTIVE
 * -> CLOSED -> ARCHIVED. `configSnapshot` freezes competencies/BSC
 * perspectives/score descriptors/self_rating_enabled at activation time
 * for audit immutability (see ConfigSnapshotBuilder).
 */
#[ORM\Entity(repositoryClass: AppraisalCycleRepository::class)]
#[ORM\Table(name: 'appraisal_cycle')]
class AppraisalCycle
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\Column(type: 'string', length: 200)]
    private string $periodName;

    #[ORM\Column(type: 'date_immutable')]
    private \DateTimeImmutable $startDate;

    #[ORM\Column(type: 'date_immutable')]
    private \DateTimeImmutable $endDate;

    #[ORM\Column(type: 'string', length: 20, enumType: AppraisalCycleStatus::class)]
    private AppraisalCycleStatus $status;

    #[ORM\Column(type: 'boolean')]
    private bool $selfRatingEnabled = true;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false)]
    private User $createdBy;

    /**
     * @var array<string, mixed>
     */
    #[ORM\Column(type: 'json')]
    private array $configSnapshot = [];

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $updatedAt;

    public function __construct(
        string $periodName,
        \DateTimeImmutable $startDate,
        \DateTimeImmutable $endDate,
        User $createdBy,
        bool $selfRatingEnabled = true,
    ) {
        $this->id = Uuid::v7();
        $this->periodName = $periodName;
        $this->startDate = $startDate;
        $this->endDate = $endDate;
        $this->createdBy = $createdBy;
        $this->selfRatingEnabled = $selfRatingEnabled;
        $this->status = AppraisalCycleStatus::DRAFT;
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

    public function getPeriodName(): string
    {
        return $this->periodName;
    }

    public function setPeriodName(string $periodName): void
    {
        $this->periodName = $periodName;
    }

    public function getStartDate(): \DateTimeImmutable
    {
        return $this->startDate;
    }

    public function setStartDate(\DateTimeImmutable $startDate): void
    {
        $this->startDate = $startDate;
    }

    public function getEndDate(): \DateTimeImmutable
    {
        return $this->endDate;
    }

    public function setEndDate(\DateTimeImmutable $endDate): void
    {
        $this->endDate = $endDate;
    }

    public function getStatus(): AppraisalCycleStatus
    {
        return $this->status;
    }

    public function setStatus(AppraisalCycleStatus $status): void
    {
        $this->status = $status;
    }

    public function isSelfRatingEnabled(): bool
    {
        return $this->selfRatingEnabled;
    }

    public function setSelfRatingEnabled(bool $selfRatingEnabled): void
    {
        $this->selfRatingEnabled = $selfRatingEnabled;
    }

    public function getCreatedBy(): User
    {
        return $this->createdBy;
    }

    /**
     * @return array<string, mixed>
     */
    public function getConfigSnapshot(): array
    {
        return $this->configSnapshot;
    }

    /**
     * @param array<string, mixed> $configSnapshot
     */
    public function setConfigSnapshot(array $configSnapshot): void
    {
        $this->configSnapshot = $configSnapshot;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }
}
