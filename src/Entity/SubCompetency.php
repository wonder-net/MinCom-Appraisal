<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\SubCompetencyRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * A ratable sub-item under a core Competency (e.g. "Punctuality" under
 * "Professionalism"). Replaces the old `Competency::$subCompetencies`
 * JSON string list, which was descriptive-only and never separately
 * rated — see that field's removal in migrations/Version20260822*.php.
 *
 * HR manages these per core value via SubCompetencyCrudController; each
 * active sub-competency under a Competency shares that competency's
 * 7.5-point ceiling in equal parts (see SubCompetencyWeightCalculator),
 * frozen onto SubCompetencyRating.maxScore at appraisal-creation time
 * (AppraisalInstanceBuilder) so a later change to the sub-competency
 * list doesn't retroactively reweight an appraisal already in progress
 * — the same freeze-at-creation principle AppraisalCycle.configSnapshot
 * already applies to competencies themselves.
 */
#[ORM\Entity(repositoryClass: SubCompetencyRepository::class)]
#[ORM\Table(name: 'sub_competency')]
#[ORM\UniqueConstraint(name: 'unique_competency_sub_competency_name', columns: ['competency_id', 'name'])]
class SubCompetency
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne(targetEntity: Competency::class)]
    #[ORM\JoinColumn(name: 'competency_id', nullable: false, onDelete: 'CASCADE')]
    private Competency $competency;

    #[ORM\Column(type: 'string', length: 200)]
    private string $name;

    #[ORM\Column(type: 'integer')]
    private int $sortOrder;

    #[ORM\Column(type: 'boolean')]
    private bool $isActive = true;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $updatedAt;

    public function __construct(Competency $competency, string $name, int $sortOrder)
    {
        $this->id = Uuid::v7();
        $this->competency = $competency;
        $this->name = $name;
        $this->sortOrder = $sortOrder;
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

    public function getCompetency(): Competency
    {
        return $this->competency;
    }

    /**
     * Real setter (unlike CompetencyRating's immutable FKs) so
     * SubCompetencyCrudController's admin form can let HR reassign
     * which core value a sub-competency belongs to.
     */
    public function setCompetency(Competency $competency): void
    {
        $this->competency = $competency;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function setName(string $name): void
    {
        $this->name = $name;
    }

    public function getSortOrder(): int
    {
        return $this->sortOrder;
    }

    public function setSortOrder(int $sortOrder): void
    {
        $this->sortOrder = $sortOrder;
    }

    public function isActive(): bool
    {
        return $this->isActive;
    }

    public function setIsActive(bool $isActive): void
    {
        $this->isActive = $isActive;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }

    public function __toString(): string
    {
        return sprintf('%s / %s', $this->competency->getName(), $this->name);
    }
}
