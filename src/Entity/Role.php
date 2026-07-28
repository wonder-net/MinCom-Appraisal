<?php

declare(strict_types=1);

namespace App\Entity;

use App\Enum\RoleName;
use App\Repository\RoleRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * An RBAC role assignable to users. Port of apps.accounts.models.Role.
 */
#[ORM\Entity(repositoryClass: RoleRepository::class)]
#[ORM\Table(name: 'role')]
class Role
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\Column(type: 'string', length: 20, unique: true, enumType: RoleName::class)]
    private RoleName $name;

    public function __construct(RoleName $name)
    {
        $this->id = Uuid::v7();
        $this->name = $name;
    }

    public function getId(): Uuid
    {
        return $this->id;
    }

    public function getName(): RoleName
    {
        return $this->name;
    }

    public function __toString(): string
    {
        return $this->name->value;
    }
}
