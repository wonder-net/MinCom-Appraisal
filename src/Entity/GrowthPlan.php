<?php

declare(strict_types=1);

namespace App\Entity;

use App\Enum\PotentialRating;
use App\Repository\GrowthPlanRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.growth_plans.models.GrowthPlan. One-to-one with
 * Appraisal (enforced by the unique constraint on appraisal_id).
 *
 * `overallAssessment` is encrypted at rest (AES-256-GCM, transparent via
 * App\Doctrine\Type\EncryptedStringType), matching Django's
 * EncryptedTextField.
 */
#[ORM\Entity(repositoryClass: GrowthPlanRepository::class)]
#[ORM\Table(name: 'growth_plan')]
#[ORM\UniqueConstraint(name: 'unique_growth_plan_per_appraisal', columns: ['appraisal_id'])]
class GrowthPlan
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\OneToOne(targetEntity: Appraisal::class)]
    #[ORM\JoinColumn(name: 'appraisal_id', nullable: false, onDelete: 'CASCADE')]
    private Appraisal $appraisal;

    #[ORM\Column(type: 'encrypted_string', nullable: true)]
    private ?string $overallAssessment = '';

    /**
     * HR change request #11: a promotion recommendation, shown on the
     * appraisal report just before the Signatures section. Encrypted
     * at rest for consistency with the other free-text appraisal
     * content on this entity.
     */
    #[ORM\Column(type: 'encrypted_string', nullable: true)]
    private ?string $promotionRecommendation = null;

    /**
     * 9-box talent grid's "potential" axis (product roadmap item, not
     * one of the 11 HR change requests) — set by the manager, optional.
     * A plain enum column, not encrypted_string: matches how every
     * other enum-typed field on this app (classification, roles,
     * statuses) is stored — encryption on this entity is reserved for
     * genuinely free-text content, not a bounded set of choices.
     */
    #[ORM\Column(type: 'string', length: 20, enumType: PotentialRating::class, nullable: true)]
    private ?PotentialRating $potentialRating = null;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $updatedAt;

    public function __construct(Appraisal $appraisal, ?string $overallAssessment = '')
    {
        $this->id = Uuid::v7();
        $this->appraisal = $appraisal;
        $this->overallAssessment = $overallAssessment;
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

    public function getOverallAssessment(): ?string
    {
        return $this->overallAssessment;
    }

    public function setOverallAssessment(?string $overallAssessment): void
    {
        $this->overallAssessment = $overallAssessment;
    }

    public function getPromotionRecommendation(): ?string
    {
        return $this->promotionRecommendation;
    }

    public function setPromotionRecommendation(?string $promotionRecommendation): void
    {
        $this->promotionRecommendation = $promotionRecommendation;
    }

    public function getPotentialRating(): ?PotentialRating
    {
        return $this->potentialRating;
    }

    public function setPotentialRating(?PotentialRating $potentialRating): void
    {
        $this->potentialRating = $potentialRating;
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
        return sprintf('Growth Plan — %s', $this->appraisal);
    }
}
