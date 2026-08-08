<?php

declare(strict_types=1);

namespace App\Entity;

use App\Enum\CompetencyApplicableTo;
use App\Repository\CompetencyRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.competencies.models.Competency. Behavioural competency
 * definition used in performance appraisals, rated by both the employee
 * (self-assessment) and their manager. No timestamps — Django's model
 * has none either.
 */
#[ORM\Entity(repositoryClass: CompetencyRepository::class)]
#[ORM\Table(name: 'competency')]
class Competency
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\Column(type: 'string', length: 200, unique: true)]
    private string $name;

    #[ORM\Column(type: 'string', length: 20, enumType: CompetencyApplicableTo::class)]
    private CompetencyApplicableTo $applicableTo;

    #[ORM\Column(type: 'boolean')]
    private bool $isCore;

    #[ORM\Column(type: 'integer')]
    private int $sortOrder;

    #[ORM\Column(type: 'boolean')]
    private bool $isActive = true;

    /**
     * Descriptive sub-competencies shown under this core value on the
     * appraisal report (HR change request #8.2) — informational only,
     * not separately rated; the rating captured on CompetencyRating
     * applies to the whole core value (see ScoreEngine).
     *
     * @var list<string>|null
     */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $subCompetencies = null;

    public function __construct(
        string $name,
        CompetencyApplicableTo $applicableTo,
        int $sortOrder,
        bool $isCore = true,
    ) {
        $this->id = Uuid::v7();
        $this->name = $name;
        $this->applicableTo = $applicableTo;
        $this->sortOrder = $sortOrder;
        $this->isCore = $isCore;
    }

    public function getId(): Uuid
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getApplicableTo(): CompetencyApplicableTo
    {
        return $this->applicableTo;
    }

    public function setApplicableTo(CompetencyApplicableTo $applicableTo): void
    {
        $this->applicableTo = $applicableTo;
    }

    public function isCore(): bool
    {
        return $this->isCore;
    }

    public function setIsCore(bool $isCore): void
    {
        $this->isCore = $isCore;
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

    /**
     * @return list<string>|null
     */
    public function getSubCompetencies(): ?array
    {
        return $this->subCompetencies;
    }

    /**
     * @param list<string>|null $subCompetencies
     */
    public function setSubCompetencies(?array $subCompetencies): void
    {
        $this->subCompetencies = $subCompetencies;
    }

    /**
     * Newline-joined view of subCompetencies for CompetencyCrudController's
     * EasyAdmin textarea field — EasyAdmin has no native repeatable-list
     * field type without an extra bundle, so the admin form edits this
     * one-item-per-line string instead of the JSON array directly.
     */
    public function getSubCompetenciesText(): string
    {
        return implode("\n", $this->subCompetencies ?? []);
    }

    public function setSubCompetenciesText(?string $text): void
    {
        $lines = array_values(array_filter(array_map('trim', explode("\n", $text ?? '')), static fn (string $line) => $line !== ''));
        $this->subCompetencies = $lines !== [] ? $lines : null;
    }

    public function __toString(): string
    {
        return $this->name;
    }
}
