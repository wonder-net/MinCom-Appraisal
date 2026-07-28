<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\ScoreDescriptorRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.appraisals.models.ScoreDescriptor. Maps a numeric score
 * range to human-readable performance labels. Null `cycle` means a
 * system default (seeded); on cycle activation the current defaults are
 * copied into cycle-specific rows and frozen in the cycle's config
 * snapshot.
 *
 * `min_score` is inclusive; `max_score` is exclusive except for the
 * final band (sort_order=5) where both bounds are inclusive — enforced
 * by callers (resolve_descriptor), not by this entity.
 *
 * Django enforces two uniqueness constraints: (cycle, sort_order), and a
 * *partial* unique index on sort_order where cycle IS NULL (a plain
 * composite unique constraint alone doesn't cover the null-cycle case,
 * since Postgres treats NULLs as distinct) — see the creating migration
 * for the raw partial index, added outside Doctrine's attribute API.
 */
#[ORM\Entity(repositoryClass: ScoreDescriptorRepository::class)]
#[ORM\Table(name: 'score_descriptor')]
#[ORM\UniqueConstraint(name: 'unique_cycle_sort_order', columns: ['cycle_id', 'sort_order'])]
class ScoreDescriptor
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne(targetEntity: AppraisalCycle::class)]
    #[ORM\JoinColumn(name: 'cycle_id', nullable: true, onDelete: 'CASCADE')]
    private ?AppraisalCycle $cycle = null;

    #[ORM\Column(type: 'decimal', precision: 5, scale: 2)]
    private string $minScore;

    #[ORM\Column(type: 'decimal', precision: 5, scale: 2)]
    private string $maxScore;

    #[ORM\Column(type: 'string', length: 100)]
    private string $kdLabel;

    #[ORM\Column(type: 'string', length: 100)]
    private string $competencyLabel;

    #[ORM\Column(type: 'integer')]
    private int $sortOrder;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $updatedAt;

    public function __construct(
        string $minScore,
        string $maxScore,
        string $kdLabel,
        string $competencyLabel,
        int $sortOrder,
        ?AppraisalCycle $cycle = null,
    ) {
        $this->id = Uuid::v7();
        $this->minScore = $minScore;
        $this->maxScore = $maxScore;
        $this->kdLabel = $kdLabel;
        $this->competencyLabel = $competencyLabel;
        $this->sortOrder = $sortOrder;
        $this->cycle = $cycle;
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

    public function getCycle(): ?AppraisalCycle
    {
        return $this->cycle;
    }

    public function getMinScore(): string
    {
        return $this->minScore;
    }

    public function getMaxScore(): string
    {
        return $this->maxScore;
    }

    public function getKdLabel(): string
    {
        return $this->kdLabel;
    }

    public function getCompetencyLabel(): string
    {
        return $this->competencyLabel;
    }

    public function getSortOrder(): int
    {
        return $this->sortOrder;
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
