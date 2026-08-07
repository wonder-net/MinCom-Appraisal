<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Appraisal;
use App\Entity\User;
use App\Enum\AppraisalPartyRole;
use App\Enum\AppraisalStatus;
use App\Enum\RoleName;
use App\Repository\EmployeeRepository;

/**
 * Port of the shared appraisal-access pure helpers duplicated across
 * apps.appraisals.views and apps.competencies.views
 * (_user_is_appraisee/_user_is_manager_of/_manager_can_crud_kds/
 * _check_appraisee_write_permission/_check_manager_write_permission).
 */
final class AppraisalAccessChecker
{
    private const PERMISSION_DENIED_MESSAGE = 'This action is not permitted at the current stage of the appraisal.';

    public function __construct(private readonly EmployeeRepository $employees)
    {
    }

    public function isAppraisee(User $user, Appraisal $appraisal): bool
    {
        $profile = $this->employees->findByUser($user);

        return $profile !== null && $appraisal->getEmployee()->getId()->equals($profile->getId());
    }

    /**
     * Port of _user_is_manager_of. Once an appraisal is escalated, the
     * executive REPLACES the original manager here — only the executive
     * passes this check, and the original manager falls back to
     * read-only access (granted separately by AppraisalRepository::
     * canUserRead(), which does not consult this method).
     */
    public function isManagerOf(User $user, Appraisal $appraisal): bool
    {
        $escalatedExecutive = $appraisal->getEscalatedExecutive();
        if ($escalatedExecutive !== null) {
            return $escalatedExecutive->getId()->equals($user->getId());
        }

        if (!($user->hasRole(RoleName::MANAGER) || $user->hasAdminRole())) {
            return false;
        }

        $profile = $this->employees->findByUser($user);
        if ($profile === null) {
            return false;
        }

        $manager = $appraisal->getEmployee()->getManager();

        return $manager !== null && $manager->getId()->equals($profile->getId());
    }

    /**
     * HR change request #3 ("Matrix Structure / 2 Reporting Lines"):
     * mirrors isManagerOf() but checks the employee's optional second
     * appraiser instead. Escalation replaces both appraisers with the
     * executive, same as isManagerOf().
     */
    public function isMatrixAppraiserOf(User $user, Appraisal $appraisal): bool
    {
        if ($appraisal->getEscalatedExecutive() !== null) {
            return false;
        }

        if (!($user->hasRole(RoleName::MANAGER) || $user->hasAdminRole())) {
            return false;
        }

        $profile = $this->employees->findByUser($user);
        if ($profile === null) {
            return false;
        }

        $matrixAppraiser = $appraisal->getEmployee()->getMatrixAppraiser();

        return $matrixAppraiser !== null && $matrixAppraiser->getId()->equals($profile->getId());
    }

    /**
     * True when the user is authorized to act as EITHER of the
     * employee's appraisers (primary manager or matrix appraiser) — the
     * general-purpose check for KD/competency-rating/growth-plan/comment
     * write access and PDF read access. isManagerOf() alone remains the
     * narrower "primary manager" check where that distinction still
     * matters (see TransitionValidator's escalation handling).
     */
    public function isAnyAppraiserOf(User $user, Appraisal $appraisal): bool
    {
        return $this->isManagerOf($user, $appraisal) || $this->isMatrixAppraiserOf($user, $appraisal);
    }

    /**
     * True when self_rating_enabled=False on the cycle and the appraisal
     * skipped straight to MANAGER_REVIEW — the manager then needs full
     * KD CRUD, not just rating, since the appraisee never had a chance
     * to populate them.
     */
    public function managerCanCrudKds(Appraisal $appraisal): bool
    {
        return $appraisal->getStatus() === AppraisalStatus::MANAGER_REVIEW && !$appraisal->getCycle()->isSelfRatingEnabled();
    }

    public function appraiseeWriteError(AppraisalStatus $status): ?string
    {
        return $status === AppraisalStatus::SELF_ASSESSMENT ? null : self::PERMISSION_DENIED_MESSAGE;
    }

    public function managerWriteError(AppraisalStatus $status): ?string
    {
        $allowed = [AppraisalStatus::MANAGER_REVIEW, AppraisalStatus::DISCUSSION, AppraisalStatus::DISPUTED];

        return in_array($status, $allowed, true) ? null : self::PERMISSION_DENIED_MESSAGE;
    }

    /**
     * Port of _derive_author_role: appraisee -> APPRAISEE, manager-of ->
     * APPRAISER, else null (caller decides — HR Admin must supply
     * author_role explicitly).
     */
    public function deriveAuthorRole(User $user, Appraisal $appraisal): ?AppraisalPartyRole
    {
        if ($this->isAppraisee($user, $appraisal)) {
            return AppraisalPartyRole::APPRAISEE;
        }
        if ($this->isAnyAppraiserOf($user, $appraisal)) {
            return AppraisalPartyRole::APPRAISER;
        }

        return null;
    }

    /**
     * Port of _user_can_write_comment: admin tier, the appraisee, or
     * either of their appraisers (manager or matrix appraiser).
     */
    public function userCanWriteComment(User $user, Appraisal $appraisal): bool
    {
        return $user->hasAdminRole() || $this->isAppraisee($user, $appraisal) || $this->isAnyAppraiserOf($user, $appraisal);
    }

    /**
     * How many distinct APPRAISER-role signers must accept in a
     * PENDING_SIGNOFF round before sign-off completes (HR change request
     * #3): the manager, plus the matrix appraiser when one is assigned.
     * Escalation replaces both with a single executive. `max(..., 1)`
     * preserves the pre-matrix-appraiser behaviour of always requiring
     * at least one APPRAISER accept, even for the edge case of an
     * employee with no manager assigned. Shared by SignAppraisalService
     * (decides when to auto-transition to SIGNED_OFF) and
     * WorkflowGuardService (re-validates the same rule for the generic
     * transition endpoint, which doesn't go through SignAppraisalService
     * at all) — both must agree, or a direct transition() call could
     * finalize sign-off with fewer than all required appraisers.
     */
    public function countRequiredAppraisers(Appraisal $appraisal): int
    {
        if ($appraisal->getEscalatedExecutive() !== null) {
            return 1;
        }

        $employee = $appraisal->getEmployee();
        $count = ($employee->getManager() !== null ? 1 : 0) + ($employee->getMatrixAppraiser() !== null ? 1 : 0);

        return max($count, 1);
    }

    /**
     * Port of _is_terminal_status: no comments may be posted (except by
     * admin-tier users on SIGNED_OFF, handled by the caller) once the
     * appraisal reaches one of these statuses.
     */
    public function isTerminalStatus(AppraisalStatus $status): bool
    {
        return in_array($status, [
            AppraisalStatus::SIGNED_OFF,
            AppraisalStatus::FINALISED,
            AppraisalStatus::EXCLUDED,
            AppraisalStatus::INCOMPLETE,
        ], true);
    }
}
