<?php

declare(strict_types=1);

namespace App\Entity;

use App\Enum\TrainingNeedPriority;
use App\Enum\TrainingNeedType;
use App\Repository\TrainingNeedRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.growth_plans.models.TrainingNeed.
 *
 * `description` is encrypted at rest (AES-256-GCM, transparent via
 * App\Doctrine\Type\EncryptedStringType), matching Django's
 * EncryptedTextField.
 */
#[ORM\Entity(repositoryClass: TrainingNeedRepository::class)]
#[ORM\Table(name: 'growth_plan_training_need')]
class TrainingNeed
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne(targetEntity: GrowthPlan::class)]
    #[ORM\JoinColumn(name: 'growth_plan_id', nullable: false, onDelete: 'CASCADE')]
    private GrowthPlan $growthPlan;

    #[ORM\Column(type: 'string', length: 20, enumType: TrainingNeedType::class)]
    private TrainingNeedType $type;

    #[ORM\Column(type: 'encrypted_string')]
    private string $description;

    #[ORM\Column(type: 'string', length: 255, nullable: true)]
    private ?string $courseTitle = null;

    #[ORM\Column(type: 'string', length: 255, nullable: true)]
    private ?string $institution = null;

    #[ORM\Column(type: 'string', length: 10, enumType: TrainingNeedPriority::class)]
    private TrainingNeedPriority $priority;

    #[ORM\Column(type: 'integer')]
    private int $sortOrder = 0;

    public function __construct(GrowthPlan $growthPlan, TrainingNeedType $type, string $description, TrainingNeedPriority $priority, int $sortOrder = 0)
    {
        $this->id = Uuid::v7();
        $this->growthPlan = $growthPlan;
        $this->type = $type;
        $this->description = $description;
        $this->priority = $priority;
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

    public function getType(): TrainingNeedType
    {
        return $this->type;
    }

    public function getDescription(): string
    {
        return $this->description;
    }

    public function getCourseTitle(): ?string
    {
        return $this->courseTitle;
    }

    public function setCourseTitle(?string $courseTitle): void
    {
        $this->courseTitle = $courseTitle;
    }

    public function getInstitution(): ?string
    {
        return $this->institution;
    }

    public function setInstitution(?string $institution): void
    {
        $this->institution = $institution;
    }

    public function getPriority(): TrainingNeedPriority
    {
        return $this->priority;
    }

    public function getSortOrder(): int
    {
        return $this->sortOrder;
    }
}
