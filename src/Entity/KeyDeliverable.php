<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\KeyDeliverableRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.appraisals.models.KeyDeliverable. Grouped by BSC
 * perspective; weights across ALL deliverables in an appraisal must sum
 * to 1.0 (enforced by the KeyDeliverable controller, Milestone 10b).
 * `weightedScore` (weight * manager_rating) is set by the scoring engine.
 */
#[ORM\Entity(repositoryClass: KeyDeliverableRepository::class)]
#[ORM\Table(name: 'key_deliverable')]
class KeyDeliverable
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne(targetEntity: Appraisal::class)]
    #[ORM\JoinColumn(name: 'appraisal_id', nullable: false, onDelete: 'CASCADE')]
    private Appraisal $appraisal;

    #[ORM\ManyToOne(targetEntity: BscPerspective::class)]
    #[ORM\JoinColumn(name: 'perspective_id', nullable: false)]
    private BscPerspective $perspective;

    #[ORM\Column(type: 'text')]
    private string $description;

    #[ORM\Column(type: 'decimal', precision: 5, scale: 4)]
    private string $weight;

    #[ORM\Column(type: 'decimal', precision: 3, scale: 2, nullable: true)]
    private ?string $selfRating = null;

    #[ORM\Column(type: 'decimal', precision: 3, scale: 2, nullable: true)]
    private ?string $managerRating = null;

    #[ORM\Column(type: 'decimal', precision: 5, scale: 4, nullable: true)]
    private ?string $weightedScore = null;

    #[ORM\Column(type: 'integer')]
    private int $sortOrder = 0;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $updatedAt;

    public function __construct(Appraisal $appraisal, BscPerspective $perspective, string $description, string $weight)
    {
        $this->id = Uuid::v7();
        $this->appraisal = $appraisal;
        $this->perspective = $perspective;
        $this->description = $description;
        $this->weight = $weight;
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

    public function getAppraisal(): Appraisal
    {
        return $this->appraisal;
    }

    public function getPerspective(): BscPerspective
    {
        return $this->perspective;
    }

    public function setPerspective(BscPerspective $perspective): void
    {
        $this->perspective = $perspective;
    }

    public function getDescription(): string
    {
        return $this->description;
    }

    public function setDescription(string $description): void
    {
        $this->description = $description;
    }

    public function getWeight(): string
    {
        return $this->weight;
    }

    public function setWeight(string $weight): void
    {
        $this->weight = $weight;
    }

    public function getSelfRating(): ?string
    {
        return $this->selfRating;
    }

    public function setSelfRating(?string $selfRating): void
    {
        $this->selfRating = $selfRating;
    }

    public function getManagerRating(): ?string
    {
        return $this->managerRating;
    }

    public function setManagerRating(?string $managerRating): void
    {
        $this->managerRating = $managerRating;
    }

    public function getWeightedScore(): ?string
    {
        return $this->weightedScore;
    }

    public function setWeightedScore(?string $weightedScore): void
    {
        $this->weightedScore = $weightedScore;
    }

    public function getSortOrder(): int
    {
        return $this->sortOrder;
    }

    public function setSortOrder(int $sortOrder): void
    {
        $this->sortOrder = $sortOrder;
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
