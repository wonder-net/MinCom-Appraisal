<?php

declare(strict_types=1);

namespace App\Entity;

use App\Enum\GrowthPlanPriority;
use App\Repository\DevelopmentNeedRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.growth_plans.models.DevelopmentNeed.
 *
 * `description` is encrypted at rest (AES-256-GCM, transparent via
 * App\Doctrine\Type\EncryptedStringType), matching Django's
 * EncryptedTextField.
 */
#[ORM\Entity(repositoryClass: DevelopmentNeedRepository::class)]
#[ORM\Table(name: 'growth_plan_development_need')]
class DevelopmentNeed
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne(targetEntity: GrowthPlan::class)]
    #[ORM\JoinColumn(name: 'growth_plan_id', nullable: false, onDelete: 'CASCADE')]
    private GrowthPlan $growthPlan;

    #[ORM\Column(type: 'encrypted_string')]
    private string $description;

    #[ORM\Column(type: 'string', length: 10, enumType: GrowthPlanPriority::class)]
    private GrowthPlanPriority $priority;

    public function __construct(GrowthPlan $growthPlan, string $description, GrowthPlanPriority $priority)
    {
        $this->id = Uuid::v7();
        $this->growthPlan = $growthPlan;
        $this->description = $description;
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

    public function getDescription(): string
    {
        return $this->description;
    }

    public function getPriority(): GrowthPlanPriority
    {
        return $this->priority;
    }
}
