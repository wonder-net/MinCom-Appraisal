<?php

declare(strict_types=1);

namespace App\Entity;

use App\Enum\AppraisalFormType;
use App\Enum\AppraisalStatus;
use App\Repository\AppraisalRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.appraisals.models.Appraisal — the core domain record.
 *
 * Optimistic locking: Django manually increments `version` via
 * `F('version') + 1` on every save(). Doctrine's native `#[ORM\Version]`
 * is the idiomatic equivalent — it auto-increments on every UPDATE and
 * throws OptimisticLockException on a stale write, so it's used here
 * instead of hand-rolling the F()-expression pattern. Callers that need
 * a friendly 409 response (the `transition` endpoint, Milestone 10c)
 * still explicitly compare the client-supplied version against
 * getVersion() before attempting the write, for response-shape control.
 *
 * `escalationReason` is encrypted at rest (AES-256-GCM, transparent via
 * App\Doctrine\Type\EncryptedStringType), matching Django's
 * EncryptedTextField.
 */
#[ORM\Entity(repositoryClass: AppraisalRepository::class)]
#[ORM\Table(name: 'appraisal')]
#[ORM\UniqueConstraint(name: 'unique_appraisal_per_cycle_employee', columns: ['cycle_id', 'employee_id'])]
class Appraisal
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne(targetEntity: AppraisalCycle::class)]
    #[ORM\JoinColumn(name: 'cycle_id', nullable: false, onDelete: 'CASCADE')]
    private AppraisalCycle $cycle;

    #[ORM\ManyToOne(targetEntity: Employee::class)]
    #[ORM\JoinColumn(name: 'employee_id', nullable: false, onDelete: 'CASCADE')]
    private Employee $employee;

    #[ORM\Column(type: 'string', length: 10, enumType: AppraisalFormType::class)]
    private AppraisalFormType $formType;

    #[ORM\Column(type: 'string', length: 20, enumType: AppraisalStatus::class)]
    private AppraisalStatus $status;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $statusChangedAt = null;

    #[ORM\Column(type: 'decimal', precision: 5, scale: 2, nullable: true)]
    private ?string $kdAverageScore = null;

    #[ORM\Column(type: 'decimal', precision: 5, scale: 2, nullable: true)]
    private ?string $bcAverageScore = null;

    #[ORM\Column(type: 'decimal', precision: 5, scale: 2, nullable: true)]
    private ?string $totalScore = null;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $kdDescriptor = null;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $bcDescriptor = null;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $performanceDescriptor = null;

    #[ORM\Column(type: 'string', length: 20, enumType: AppraisalStatus::class, nullable: true)]
    private ?AppraisalStatus $previousStatus = null;

    #[ORM\Version]
    #[ORM\Column(type: 'integer')]
    private int $version = 1;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'escalated_executive_id', nullable: true)]
    private ?User $escalatedExecutive = null;

    #[ORM\Column(type: 'encrypted_string', nullable: true)]
    private ?string $escalationReason = null;

    #[ORM\Column(type: 'integer')]
    private int $signingRound = 0;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $updatedAt;

    public function __construct(
        AppraisalCycle $cycle,
        Employee $employee,
        AppraisalFormType $formType,
        AppraisalStatus $status,
    ) {
        $this->id = Uuid::v7();
        $this->cycle = $cycle;
        $this->employee = $employee;
        $this->formType = $formType;
        $this->status = $status;
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

    public function getCycle(): AppraisalCycle
    {
        return $this->cycle;
    }

    public function getEmployee(): Employee
    {
        return $this->employee;
    }

    public function getFormType(): AppraisalFormType
    {
        return $this->formType;
    }

    public function getStatus(): AppraisalStatus
    {
        return $this->status;
    }

    public function setStatus(AppraisalStatus $status): void
    {
        $this->status = $status;
        $this->statusChangedAt = new \DateTimeImmutable();
    }

    /**
     * Sets status via a bulk admin override (cycle close / finalise-all)
     * without touching statusChangedAt — mirrors Django's
     * queryset.update() bulk path used by those two actions, which
     * bypasses model-level field logic entirely (unlike the workflow
     * transition path via setStatus(), which always stamps
     * statusChangedAt).
     */
    public function forceStatus(AppraisalStatus $status): void
    {
        $this->status = $status;
    }

    public function getStatusChangedAt(): ?\DateTimeImmutable
    {
        return $this->statusChangedAt;
    }

    public function getKdAverageScore(): ?string
    {
        return $this->kdAverageScore;
    }

    public function setKdAverageScore(?string $kdAverageScore): void
    {
        $this->kdAverageScore = $kdAverageScore;
    }

    public function getBcAverageScore(): ?string
    {
        return $this->bcAverageScore;
    }

    public function setBcAverageScore(?string $bcAverageScore): void
    {
        $this->bcAverageScore = $bcAverageScore;
    }

    public function getTotalScore(): ?string
    {
        return $this->totalScore;
    }

    public function setTotalScore(?string $totalScore): void
    {
        $this->totalScore = $totalScore;
    }

    public function getKdDescriptor(): ?string
    {
        return $this->kdDescriptor;
    }

    public function setKdDescriptor(?string $kdDescriptor): void
    {
        $this->kdDescriptor = $kdDescriptor;
    }

    public function getBcDescriptor(): ?string
    {
        return $this->bcDescriptor;
    }

    public function setBcDescriptor(?string $bcDescriptor): void
    {
        $this->bcDescriptor = $bcDescriptor;
    }

    public function getPerformanceDescriptor(): ?string
    {
        return $this->performanceDescriptor;
    }

    public function setPerformanceDescriptor(?string $performanceDescriptor): void
    {
        $this->performanceDescriptor = $performanceDescriptor;
    }

    public function getPreviousStatus(): ?AppraisalStatus
    {
        return $this->previousStatus;
    }

    public function setPreviousStatus(?AppraisalStatus $previousStatus): void
    {
        $this->previousStatus = $previousStatus;
    }

    public function getVersion(): int
    {
        return $this->version;
    }

    public function getEscalatedExecutive(): ?User
    {
        return $this->escalatedExecutive;
    }

    public function setEscalatedExecutive(?User $escalatedExecutive): void
    {
        $this->escalatedExecutive = $escalatedExecutive;
    }

    public function getEscalationReason(): ?string
    {
        return $this->escalationReason;
    }

    public function setEscalationReason(?string $escalationReason): void
    {
        $this->escalationReason = $escalationReason;
    }

    public function getSigningRound(): int
    {
        return $this->signingRound;
    }

    public function setSigningRound(int $signingRound): void
    {
        $this->signingRound = $signingRound;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }

    /**
     * Lets EasyAdmin's AssociationField (GrowthPlan, KeyDeliverable,
     * CompetencyRating, Signature, Comment all point back here) render
     * a readable label instead of "Appraisal #<uuid>".
     */
    public function __toString(): string
    {
        return sprintf('%s — %s (%s)', $this->employee, $this->cycle, $this->status->value);
    }
}
