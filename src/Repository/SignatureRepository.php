<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Appraisal;
use App\Entity\AppraisalCycle;
use App\Entity\Signature;
use App\Entity\User;
use App\Enum\AppraisalPartyRole;
use App\Enum\SignatureAction;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Signature>
 */
class SignatureRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Signature::class);
    }

    /**
     * @return list<Signature>
     */
    public function findByAppraisalOrderedBySignedAt(Appraisal $appraisal): array
    {
        return $this->findBy(['appraisal' => $appraisal], ['signedAt' => 'ASC']);
    }

    /**
     * Signatures for the given round only — prior-round signatures are
     * an immutable audit trail and must never satisfy round-scoped
     * checks (TASK-276b).
     *
     * @return list<Signature>
     */
    public function findByAppraisalAndRound(Appraisal $appraisal, int $round): array
    {
        return $this->findBy(['appraisal' => $appraisal, 'signingRound' => $round]);
    }

    public function hasAcceptForRoleAndRound(Appraisal $appraisal, AppraisalPartyRole $role, int $round): bool
    {
        return $this->count([
            'appraisal' => $appraisal,
            'signerRole' => $role,
            'action' => SignatureAction::ACCEPT,
            'signingRound' => $round,
        ]) > 0;
    }

    public function existsForSignerAndRound(Appraisal $appraisal, User $signer, int $round): bool
    {
        return $this->count(['appraisal' => $appraisal, 'signer' => $signer, 'signingRound' => $round]) > 0;
    }

    /**
     * Used by the bulk-import executor's update_or_create-by-delete
     * emulation: Signature has no setters for signerRole/action/
     * signedAt (append-only by design elsewhere), so overwriting a
     * prior round-1 signature from an earlier failed import attempt
     * means removing this row before persisting a fresh one.
     */
    public function findOneByAppraisalSignerAndRound(Appraisal $appraisal, User $signer, int $round): ?Signature
    {
        return $this->findOneBy(['appraisal' => $appraisal, 'signer' => $signer, 'signingRound' => $round]);
    }

    /**
     * Port of DisputeLogReportView._build_payload's first query:
     * REJECT/COMMENTS_ATTACHED signatures for appraisals in the cycle.
     *
     * @return list<Signature>
     */
    public function findDisputeActionsByCycle(AppraisalCycle $cycle): array
    {
        return $this->createQueryBuilder('s')
            ->innerJoin('s.appraisal', 'a')->addSelect('a')
            ->innerJoin('a.employee', 'e')->addSelect('e')
            ->innerJoin('e.department', 'd')->addSelect('d')
            ->innerJoin('a.cycle', 'c')->addSelect('c')
            ->where('a.cycle = :cycle')
            ->andWhere('s.action IN (:actions)')
            ->setParameter('cycle', $cycle)
            ->setParameter('actions', [SignatureAction::REJECT, SignatureAction::COMMENTS_ATTACHED])
            ->getQuery()
            ->getResult();
    }
}
