<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\DepartmentRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.employees.models.Department. Self-referential hierarchy
 * (parent/children) exists in Django but is never read by any endpoint
 * (DepartmentTreeSerializer/get_ancestors()/get_descendants() have no
 * callers) — the parent FK is kept for schema fidelity, but those helper
 * methods are not ported since there's nothing exercising them.
 */
#[ORM\Entity(repositoryClass: DepartmentRepository::class)]
#[ORM\Table(name: 'department')]
class Department
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\Column(type: 'string', length: 255)]
    private string $name;

    #[ORM\Column(type: 'string', length: 50, unique: true)]
    private string $code;

    #[ORM\ManyToOne(targetEntity: self::class)]
    #[ORM\JoinColumn(name: 'parent_id', nullable: true, onDelete: 'CASCADE')]
    private ?self $parent = null;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $updatedAt;

    public function __construct(string $name, string $code)
    {
        $this->id = Uuid::v7();
        $this->name = $name;
        $this->code = $code;
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

    public function getName(): string
    {
        return $this->name;
    }

    public function getCode(): string
    {
        return $this->code;
    }

    public function getParent(): ?self
    {
        return $this->parent;
    }

    public function setParent(?self $parent): void
    {
        $this->parent = $parent;
    }

    /**
     * "Directorate / Department" display label (HR change request #6).
     * `parent` is used as the directorate: when set, renders
     * "{parent name} / {this name}"; otherwise just this department's
     * name, matching the existing PDF layout for departments with no
     * directorate configured.
     */
    public function getFullLabel(): string
    {
        return $this->parent !== null
            ? sprintf('%s / %s', $this->parent->getName(), $this->name)
            : $this->name;
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
     * Lets EasyAdmin's AssociationField (and anything else needing a
     * plain-text label) render this sensibly instead of falling back to
     * "Department #<uuid>" — every CRUD screen that links to a
     * Department (Employee, and Department's own self-referential
     * `parent`) benefits, not just one controller's field config.
     */
    public function __toString(): string
    {
        return $this->getFullLabel();
    }
}
