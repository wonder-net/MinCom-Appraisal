<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\SubCompetencyRatingRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * One sub-competency rating row, nested under its parent CompetencyRating.
 * Two ways a row comes to exist:
 *
 *  - Seeded by AppraisalInstanceBuilder from HR's admin-managed
 *    SubCompetency list at cycle-activation time (see SubCompetency's
 *    docblock) — `subCompetency` is set, `name`/`sortOrder` are a
 *    denormalized COPY of that row's values at that moment (frozen, same
 *    reasoning as `maxScore` below: a later HR rename shouldn't
 *    retroactively change what an in-progress appraisal already showed).
 *  - Added directly by the appraisee during their own SELF_ASSESSMENT
 *    (SubCompetencyRatingCreateController) — `subCompetency` is null,
 *    `name`/`sortOrder` are set directly. This is deliberately
 *    per-appraisal only: it does NOT touch HR's master SubCompetency
 *    list, isn't visible on anyone else's appraisal, and works even for
 *    a core value HR never broke into sub-items at all.
 *
 * A core competency with no SubCompetencyRating rows at all keeps using
 * the legacy direct rating on CompetencyRating instead (see
 * CompetencyRatingUpdateController).
 *
 * `maxScore` is this row's equal share of the parent competency's
 * 7.5-point ceiling (SubCompetencyWeightCalculator) — recomputed across
 * every sibling (not just frozen once) whenever the sibling COUNT
 * changes, i.e. whenever the appraisee adds one, so the shares for one
 * CompetencyRating always sum to exactly 7.5. self_rating/manager_rating
 * must each fall within [0, maxScore]; once every sibling on a side is
 * rated, SubCompetencyRatingUpdateController rolls the sum back up onto
 * the parent CompetencyRating's same-side field, which is what
 * ScoreEngine actually sums for bcAverageScore — so ScoreEngine itself
 * needs no changes.
 */
#[ORM\Entity(repositoryClass: SubCompetencyRatingRepository::class)]
#[ORM\Table(name: 'sub_competency_rating')]
#[ORM\UniqueConstraint(name: 'unique_competency_rating_sub_competency', columns: ['competency_rating_id', 'sub_competency_id'])]
class SubCompetencyRating
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne(targetEntity: CompetencyRating::class)]
    #[ORM\JoinColumn(name: 'competency_rating_id', nullable: false, onDelete: 'CASCADE')]
    private CompetencyRating $competencyRating;

    /**
     * Null for an appraisee-added, per-appraisal-only item — see this
     * class's docblock.
     */
    #[ORM\ManyToOne(targetEntity: SubCompetency::class)]
    #[ORM\JoinColumn(name: 'sub_competency_id', nullable: true)]
    private ?SubCompetency $subCompetency;

    #[ORM\Column(type: 'string', length: 200)]
    private string $name;

    #[ORM\Column(type: 'integer')]
    private int $sortOrder;

    #[ORM\Column(type: 'decimal', precision: 4, scale: 2)]
    private string $maxScore;

    #[ORM\Column(type: 'decimal', precision: 4, scale: 2, nullable: true)]
    private ?string $selfRating = null;

    #[ORM\Column(type: 'decimal', precision: 4, scale: 2, nullable: true)]
    private ?string $managerRating = null;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $updatedAt;

    public function __construct(
        CompetencyRating $competencyRating,
        ?SubCompetency $subCompetency,
        string $name,
        int $sortOrder,
        string $maxScore,
    ) {
        $this->id = Uuid::v7();
        $this->competencyRating = $competencyRating;
        $this->subCompetency = $subCompetency;
        $this->name = $name;
        $this->sortOrder = $sortOrder;
        $this->maxScore = $maxScore;
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

    public function getCompetencyRating(): CompetencyRating
    {
        return $this->competencyRating;
    }

    public function getSubCompetency(): ?SubCompetency
    {
        return $this->subCompetency;
    }

    /**
     * True when this row is a per-appraisal item the appraisee added
     * themselves, rather than seeded from HR's master SubCompetency list.
     */
    public function isCustom(): bool
    {
        return $this->subCompetency === null;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getSortOrder(): int
    {
        return $this->sortOrder;
    }

    public function setSortOrder(int $sortOrder): void
    {
        $this->sortOrder = $sortOrder;
    }

    public function getMaxScore(): string
    {
        return $this->maxScore;
    }

    public function setMaxScore(string $maxScore): void
    {
        $this->maxScore = $maxScore;
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

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }
}
