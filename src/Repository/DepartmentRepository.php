<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Department;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Department>
 */
class DepartmentRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Department::class);
    }

    public function findOneByNameCaseInsensitive(string $name): ?Department
    {
        return $this->createQueryBuilder('d')
            ->where('LOWER(d.name) = LOWER(:name)')
            ->setParameter('name', $name)
            ->getQuery()
            ->getOneOrNullResult();
    }

    public function existsByCode(string $code): bool
    {
        return $this->count(['code' => $code]) > 0;
    }

    /**
     * @return list<Department>
     */
    public function findAllOrderedByName(): array
    {
        return $this->findBy([], ['name' => 'ASC']);
    }
}
