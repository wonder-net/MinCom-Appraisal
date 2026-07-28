<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\BscPerspective;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<BscPerspective>
 */
class BscPerspectiveRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, BscPerspective::class);
    }

    /**
     * @return list<BscPerspective>
     */
    public function findAllOrderedBySortOrder(): array
    {
        return $this->findBy([], ['sortOrder' => 'ASC']);
    }
}
