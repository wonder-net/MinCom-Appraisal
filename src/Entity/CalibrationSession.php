<?php

declare(strict_types=1);

namespace App\Entity;

use App\Enum\CalibrationSessionStatus;
use App\Repository\CalibrationSessionRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Calibration (product roadmap item — see the "9-box first, calibration
 * second" roadmap conversation and CalibrationSessionStatus's
 * docblock).
 *
 * One row per (cycle, department): before this session is marked
 * COMPLETE, no SIGNED_OFF appraisal for an employee in that department
 * can reach FINALISED — enforced by CalibrationService::isComplete(),
 * checked from all three paths that can move an appraisal to
 * FINALISED (the individual transition endpoint via
 * WorkflowGuardService, AppraisalCycleFinaliseAllController's
 * per-cycle bulk finalise, and AppraisalBulkFinaliseController's
 * by-id bulk finalise) — a gate is only real if every entry point
 * enforces it, matching the lesson already learned once this session
 * with WorkflowGuardService::pendingSignoffToSignedOff() being
 * reachable around SignAppraisalService's stricter check via the
 * generic transition endpoint.
 *
 * A row is created lazily by CalibrationService::complete() — there is
 * no separate "start calibration" step, matching how there's no
 * separate row for a department that's never needed one; the absence
 * of a row is exactly equivalent to PENDING; existing/absent are the
 * same "not yet calibrated" state.
 */
#[ORM\Entity(repositoryClass: CalibrationSessionRepository::class)]
#[ORM\Table(name: 'calibration_session')]
#[ORM\UniqueConstraint(name: 'unique_calibration_session_per_cycle_department', columns: ['cycle_id', 'department_id'])]
class CalibrationSession
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne(targetEntity: AppraisalCycle::class)]
    #[ORM\JoinColumn(name: 'cycle_id', nullable: false, onDelete: 'CASCADE')]
    private AppraisalCycle $cycle;

    #[ORM\ManyToOne(targetEntity: Department::class)]
    #[ORM\JoinColumn(name: 'department_id', nullable: false, onDelete: 'CASCADE')]
    private Department $department;

    #[ORM\Column(type: 'string', length: 20, enumType: CalibrationSessionStatus::class)]
    private CalibrationSessionStatus $status;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'completed_by_id', nullable: true)]
    private ?User $completedBy = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $completedAt = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $notes = null;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $updatedAt;

    public function __construct(AppraisalCycle $cycle, Department $department)
    {
        $this->id = Uuid::v7();
        $this->cycle = $cycle;
        $this->department = $department;
        $this->status = CalibrationSessionStatus::PENDING;
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

    public function getDepartment(): Department
    {
        return $this->department;
    }

    public function getStatus(): CalibrationSessionStatus
    {
        return $this->status;
    }

    public function markComplete(User $completedBy, ?string $notes): void
    {
        $this->status = CalibrationSessionStatus::COMPLETE;
        $this->completedBy = $completedBy;
        $this->completedAt = new \DateTimeImmutable();
        $this->notes = $notes;
    }

    public function reopen(): void
    {
        $this->status = CalibrationSessionStatus::PENDING;
        $this->completedBy = null;
        $this->completedAt = null;
    }

    public function getCompletedBy(): ?User
    {
        return $this->completedBy;
    }

    public function getCompletedAt(): ?\DateTimeImmutable
    {
        return $this->completedAt;
    }

    public function getNotes(): ?string
    {
        return $this->notes;
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
