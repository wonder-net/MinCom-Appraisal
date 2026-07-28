<?php

declare(strict_types=1);

namespace App\Entity;

use App\Enum\StrengthWeaknessType;
use App\Repository\StrengthWeaknessRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.growth_plans.models.StrengthWeakness.
 *
 * `description` is encrypted at rest (AES-256-GCM, transparent via
 * App\Doctrine\Type\EncryptedStringType), matching Django's
 * EncryptedTextField.
 */
#[ORM\Entity(repositoryClass: StrengthWeaknessRepository::class)]
#[ORM\Table(name: 'growth_plan_strength_weakness')]
class StrengthWeakness
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne(targetEntity: GrowthPlan::class)]
    #[ORM\JoinColumn(name: 'growth_plan_id', nullable: false, onDelete: 'CASCADE')]
    private GrowthPlan $growthPlan;

    #[ORM\Column(type: 'string', length: 10, enumType: StrengthWeaknessType::class)]
    private StrengthWeaknessType $type;

    #[ORM\Column(type: 'encrypted_string')]
    private string $description;

    #[ORM\Column(type: 'integer')]
    private int $sortOrder = 0;

    public function __construct(GrowthPlan $growthPlan, StrengthWeaknessType $type, string $description, int $sortOrder = 0)
    {
        $this->id = Uuid::v7();
        $this->growthPlan = $growthPlan;
        $this->type = $type;
        $this->description = $description;
        $this->sortOrder = $sortOrder;
    }

    public function getId(): Uuid
    {
        return $this->id;
    }

    public function getGrowthPlan(): GrowthPlan
    {
        return $this->growthPlan;
    }

    public function getType(): StrengthWeaknessType
    {
        return $this->type;
    }

    public function getDescription(): string
    {
        return $this->description;
    }

    public function getSortOrder(): int
    {
        return $this->sortOrder;
    }
}
