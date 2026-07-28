<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\CareerPlanRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.growth_plans.models.CareerPlan.
 *
 * `priority` is a plain string, NOT App\Enum\GrowthPlanPriority: Django's
 * CareerPlanWriteSerializer uniquely allows an absent/blank priority
 * (required=False, allow_blank=True, default="") which then gets
 * persisted verbatim as an empty string — Django's CharField choices
 * are a serializer/form-level constraint, not a DB one, so this
 * (likely accidental) laxity is a real, reachable production state.
 * Storing this as a strict enum column would make that state
 * unrepresentable. GrowthPlanWriteValidator still validates a
 * *non-blank* value against GrowthPlanPriority's cases.
 *
 * `aspiredRole` is encrypted at rest (AES-256-GCM, transparent via
 * App\Doctrine\Type\EncryptedStringType), matching Django's
 * EncryptedCharField. CareerAspirationPipelineBuilder already aggregates
 * by this field in PHP (not SQL GROUP BY) — see its own docblock — so
 * encrypting it required no change there.
 */
#[ORM\Entity(repositoryClass: CareerPlanRepository::class)]
#[ORM\Table(name: 'growth_plan_career_plan')]
class CareerPlan
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne(targetEntity: GrowthPlan::class)]
    #[ORM\JoinColumn(name: 'growth_plan_id', nullable: false, onDelete: 'CASCADE')]
    private GrowthPlan $growthPlan;

    #[ORM\Column(type: 'encrypted_string')]
    private string $aspiredRole;

    #[ORM\Column(type: 'string', length: 10)]
    private string $priority;

    public function __construct(GrowthPlan $growthPlan, string $aspiredRole, string $priority = '')
    {
        $this->id = Uuid::v7();
        $this->growthPlan = $growthPlan;
        $this->aspiredRole = $aspiredRole;
        $this->priority = $priority;
    }

    public function getId(): Uuid
    {
        return $this->id;
    }

    public function getGrowthPlan(): GrowthPlan
    {
        return $this->growthPlan;
    }

    public function getAspiredRole(): string
    {
        return $this->aspiredRole;
    }

    public function getPriority(): string
    {
        return $this->priority;
    }
}
