<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\AppraisalBulkImportJob;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<AppraisalBulkImportJob>
 */
class AppraisalBulkImportJobRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, AppraisalBulkImportJob::class);
    }
}
