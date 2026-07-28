<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Role;
use App\Enum\RoleName;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Role>
 */
class RoleRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Role::class);
    }

    public function findByName(RoleName $name): ?Role
    {
        return $this->findOneBy(['name' => $name]);
    }
}
