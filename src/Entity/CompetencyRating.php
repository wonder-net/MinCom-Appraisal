<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\CompetencyRatingRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.competencies.models.CompetencyRating. Deferred from the
 * `competencies` milestone (Milestone 9) since it's genuinely
 * appraisals-domain — Django itself registers CompetencyRatingViewSet's
 * routes under apps/appraisals/urls.py, not competencies/urls.py. One
 * row per (appraisal, competency) pair, pre-created by cycle activation
 * (AppraisalInstanceBuilder).
 */
#[ORM\Entity(repositoryClass: CompetencyRatingRepository::class)]
#[ORM\Table(name: 'competency_rating')]
#[ORM\UniqueConstraint(name: 'unique_appraisal_competency', columns: ['appraisal_id', 'competency_id'])]
class CompetencyRating
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne(targetEntity: Appraisal::class)]
    #[ORM\JoinColumn(name: 'appraisal_id', nullable: false, onDelete: 'CASCADE')]
    private Appraisal $appraisal;

    #[ORM\ManyToOne(targetEntity: Competency::class)]
    #[ORM\JoinColumn(name: 'competency_id', nullable: false)]
    private Competency $competency;

    #[ORM\Column(type: 'decimal', precision: 3, scale: 2, nullable: true)]
    private ?string $selfRating = null;

    #[ORM\Column(type: 'decimal', precision: 3, scale: 2, nullable: true)]
    private ?string $managerRating = null;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $updatedAt;

    public function __construct(Appraisal $appraisal, Competency $competency)
    {
        $this->id = Uuid::v7();
        $this->appraisal = $appraisal;
        $this->competency = $competency;
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

    public function getCompetency(): Competency
    {
        return $this->competency;
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
