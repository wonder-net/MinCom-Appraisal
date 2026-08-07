<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Appraisal;
use App\Entity\Employee;
use App\Entity\Signature;
use App\Entity\User;
use App\Enum\AppraisalPartyRole;
use App\Enum\AppraisalStatus;
use App\Enum\SignatureAction;
use App\Exception\DuplicateSignatureException;
use App\Exception\SignPermissionException;
use App\Repository\EmployeeRepository;
use App\Repository\SignatureRepository;
use Doctrine\DBAL\LockMode;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.appraisals.services.{derive_signer_role,
 * validate_sign_permission, sign_appraisal}.
 */
final class SignAppraisalService
{
    public function __construct(
        private readonly EmployeeRepository $employees,
        private readonly SignatureRepository $signatures,
        private readonly WorkflowService $workflow,
        private readonly EntityManagerInterface $em,
        private readonly AuditService $auditService,
        private readonly AppraisalAccessChecker $access,
    ) {
    }

    public function sign(
        string $appraisalId,
        User $user,
        SignatureAction $action,
        bool $discussed,
        ?string $reason,
        string $ipAddress,
        string $userAgentHash,
    ): ?Signature {
        return $this->em->wrapInTransaction(function () use ($appraisalId, $user, $action, $discussed, $reason, $ipAddress, $userAgentHash): ?Signature {
            $appraisal = $this->em->find(Appraisal::class, Uuid::fromString($appraisalId), LockMode::PESSIMISTIC_WRITE);
            if ($appraisal === null) {
                return null;
            }

            $profile = $this->employees->findByUser($user);
            $signerRole = $this->deriveSignerRole($profile, $user, $appraisal);

            $error = $this->validateSignPermission($signerRole, $appraisal->getStatus());
            if ($error !== null) {
                throw new SignPermissionException($error);
            }

            $currentRound = $appraisal->getSigningRound();
            if ($this->signatures->existsForSignerAndRound($appraisal, $user, $currentRound)) {
                throw new DuplicateSignatureException('You have already signed this appraisal.');
            }

            $signature = new Signature(
                $appraisal,
                $user,
                $signerRole,
                $action,
                new \DateTimeImmutable(),
                $ipAddress,
                $userAgentHash,
                $currentRound,
            );
            $signature->setDiscussed($discussed);
            $signature->setReason($reason);

            $this->em->persist($signature);
            $this->em->flush();

            $this->auditService->log(
                'appraisal.signed',
                'Appraisal',
                $appraisal->getId(),
                $user,
                null,
                ['signature_id' => (string) $signature->getId(), 'signer_role' => $signerRole->value, 'action' => $action->value],
                $ipAddress,
                ['action' => $action->value, 'signer_role' => $signerRole->value],
            );

            if ($action === SignatureAction::REJECT || $action === SignatureAction::COMMENTS_ATTACHED) {
                $this->workflow->doTransition($appraisalId, AppraisalStatus::DISPUTED, $user, $appraisal->getVersion());
            } elseif ($action === SignatureAction::ACCEPT) {
                $hasAppraiseeAccept = $this->signatures->hasAcceptForRoleAndRound($appraisal, AppraisalPartyRole::APPRAISEE, $currentRound);
                $acceptedAppraisers = $this->signatures->countDistinctAcceptedAppraisersForRound($appraisal, $currentRound);
                $requiredAppraisers = $this->access->countRequiredAppraisers($appraisal);
                if ($hasAppraiseeAccept && $acceptedAppraisers >= $requiredAppraisers) {
                    $this->workflow->doTransition($appraisalId, AppraisalStatus::SIGNED_OFF, $user, $appraisal->getVersion());
                }
            }

            return $signature;
        });
    }

    /**
     * Port of derive_signer_role, extended for HR change request #3
     * ("Matrix Structure / 2 Reporting Lines"): either the manager OR
     * the matrix appraiser resolves to APPRAISER. Once escalated, the
     * escalated executive replaces BOTH appraisers for signing; neither
     * the manager nor the matrix appraiser — even though they still
     * match the appraisee's org-hierarchy relationships — falls through
     * to null (not authorised to sign). The appraisee path is
     * unaffected by escalation.
     */
    private function deriveSignerRole(?Employee $profile, User $user, Appraisal $appraisal): ?AppraisalPartyRole
    {
        if ($profile !== null && $profile->getId()->equals($appraisal->getEmployee()->getId())) {
            return AppraisalPartyRole::APPRAISEE;
        }

        $escalatedExecutive = $appraisal->getEscalatedExecutive();
        if ($escalatedExecutive !== null) {
            return $escalatedExecutive->getId()->equals($user->getId()) ? AppraisalPartyRole::APPRAISER : null;
        }

        if ($profile === null) {
            return null;
        }

        $employee = $appraisal->getEmployee();
        $manager = $employee->getManager();
        $matrixAppraiser = $employee->getMatrixAppraiser();

        $isManager = $manager !== null && $profile->getId()->equals($manager->getId());
        $isMatrixAppraiser = $matrixAppraiser !== null && $profile->getId()->equals($matrixAppraiser->getId());

        return $isManager || $isMatrixAppraiser ? AppraisalPartyRole::APPRAISER : null;
    }

    private function validateSignPermission(?AppraisalPartyRole $signerRole, AppraisalStatus $status): ?string
    {
        if ($status !== AppraisalStatus::PENDING_SIGNOFF) {
            return 'Signatures are only allowed when the appraisal is in PENDING_SIGNOFF status.';
        }
        if ($signerRole === null) {
            return 'Only the appraisee or one of their appraisers can sign this appraisal.';
        }

        return null;
    }
}
