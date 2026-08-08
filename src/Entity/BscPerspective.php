<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\BscPerspectiveRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.appraisals.models.BSCPerspective. Reference data (the four
 * standard Balanced Scorecard perspectives), seeded by migration. No
 * timestamps — Django's model has none.
 */
#[ORM\Entity(repositoryClass: BscPerspectiveRepository::class)]
#[ORM\Table(name: 'bsc_perspective')]
class BscPerspective
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\Column(type: 'string', length: 100, unique: true)]
    private string $name;

    #[ORM\Column(type: 'integer', unique: true)]
    private int $sortOrder;

    #[ORM\Column(type: 'decimal', precision: 5, scale: 4, nullable: true)]
    private ?string $weightCap = null;

    #[ORM\Column(type: 'integer', nullable: true)]
    private ?int $maxKdCount = null;

    #[ORM\Column(type: 'decimal', precision: 5, scale: 4, nullable: true)]
    private ?string $weightCapMgr = null;

    #[ORM\Column(type: 'integer', nullable: true)]
    private ?int $maxKdCountMgr = null;

    public function __construct(string $name, int $sortOrder)
    {
        $this->id = Uuid::v7();
        $this->name = $name;
        $this->sortOrder = $sortOrder;
    }

    public function getId(): Uuid
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getSortOrder(): int
    {
        return $this->sortOrder;
    }

    public function setSortOrder(int $sortOrder): void
    {
        $this->sortOrder = $sortOrder;
    }

    public function getWeightCap(): ?string
    {
        return $this->weightCap;
    }

    public function setWeightCap(?string $weightCap): void
    {
        $this->weightCap = $weightCap;
    }

    public function getMaxKdCount(): ?int
    {
        return $this->maxKdCount;
    }

    public function setMaxKdCount(?int $maxKdCount): void
    {
        $this->maxKdCount = $maxKdCount;
    }

    public function getWeightCapMgr(): ?string
    {
        return $this->weightCapMgr;
    }

    public function setWeightCapMgr(?string $weightCapMgr): void
    {
        $this->weightCapMgr = $weightCapMgr;
    }

    public function getMaxKdCountMgr(): ?int
    {
        return $this->maxKdCountMgr;
    }

    public function setMaxKdCountMgr(?int $maxKdCountMgr): void
    {
        $this->maxKdCountMgr = $maxKdCountMgr;
    }

    public function __toString(): string
    {
        return $this->name;
    }
}
