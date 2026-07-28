<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Appraisal;
use App\Entity\Employee;
use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Enum\RoleName;
use App\Exception\TransitionException;
use App\Repository\EmployeeRepository;

/**
 * Port of apps.appraisals.workflow.validate_transition /
 * _check_role_permission / _check_ownership.
 */
final class TransitionValidator
{
    /**
     * @var array<string, list<string>>
     */
    private const VALID_TRANSITIONS = [
        'SELF_ASSESSMENT' => ['MANAGER_REVIEW'],
        'MANAGER_REVIEW' => ['DISCUSSION'],
        'DISCUSSION' => ['GROWTH_PLANNING'],
        'GROWTH_PLANNING' => ['PENDING_SIGNOFF'],
        'PENDING_SIGNOFF' => ['SIGNED_OFF', 'DISPUTED'],
        'DISPUTED' => ['DISCUSSION'],
        'SIGNED_OFF' => ['FINALISED'],
    ];

    /**
     * @var array<string, list<RoleName>>
     */
    private const TRANSITION_ROLES = [
        'SELF_ASSESSMENT|MANAGER_REVIEW' => [RoleName::EMPLOYEE, RoleName::MANAGER, RoleName::HR_ADMIN, RoleName::SYSTEM_ADMIN],
        'MANAGER_REVIEW|DISCUSSION' => [RoleName::MANAGER, RoleName::HR_ADMIN, RoleName::SYSTEM_ADMIN],
        'DISCUSSION|GROWTH_PLANNING' => [RoleName::EMPLOYEE, RoleName::MANAGER, RoleName::HR_ADMIN, RoleName::SYSTEM_ADMIN],
        'GROWTH_PLANNING|PENDING_SIGNOFF' => [RoleName::EMPLOYEE, RoleName::MANAGER, RoleName::HR_ADMIN, RoleName::SYSTEM_ADMIN],
        'PENDING_SIGNOFF|SIGNED_OFF' => [RoleName::EMPLOYEE, RoleName::MANAGER, RoleName::HR_ADMIN, RoleName::SYSTEM_ADMIN],
        'PENDING_SIGNOFF|DISPUTED' => [RoleName::EMPLOYEE, RoleName::MANAGER, RoleName::HR_ADMIN, RoleName::SYSTEM_ADMIN],
        'DISPUTED|DISCUSSION' => [RoleName::EMPLOYEE, RoleName::MANAGER, RoleName::HR_ADMIN, RoleName::SYSTEM_ADMIN],
        'SIGNED_OFF|FINALISED' => [RoleName::HR_ADMIN, RoleName::SYSTEM_ADMIN],
    ];

    public function __construct(
        private readonly WorkflowGuardService $guards,
        private readonly EmployeeRepository $employees,
    ) {
    }

    public function validate(Appraisal $appraisal, AppraisalStatus $toStatus, User $user): void
    {
        $fromStatus = $appraisal->getStatus();

        $allowedDestinations = self::VALID_TRANSITIONS[$fromStatus->value] ?? [];
        if (!in_array($toStatus->value, $allowedDestinations, true)) {
            throw new TransitionException(
                sprintf('Transition from %s to %s is not allowed.', $fromStatus->label(), $toStatus->label()),
                'INVALID_TRANSITION',
            );
        }

        if ($fromStatus === AppraisalStatus::SELF_ASSESSMENT
            && $toStatus === AppraisalStatus::MANAGER_REVIEW
            && !$appraisal->getCycle()->isSelfRatingEnabled()
        ) {
            throw new TransitionException('Self-assessment is disabled for this cycle.', 'INVALID_TRANSITION');
        }

        // 1c. Escalated-executive override: once an appraisal is
        // escalated, the executive acts in place of the original manager
        // for any manager-side write transition (self-assessment
        // submission excluded — only the appraisee submits their own).
        // The original manager is blocked from manager-side transitions;
        // HR Admin keeps its god-mode bypass and the appraisee retains
        // their own appraisee-side transitions.
        $escalatedExecutive = $appraisal->getEscalatedExecutive();
        if ($escalatedExecutive !== null) {
            $isEscalatedExecutive = $escalatedExecutive->getId()->equals($user->getId());
            $transitionRoles = self::TRANSITION_ROLES[$fromStatus->value.'|'.$toStatus->value] ?? [];
            $isManagerSideTransition = in_array(RoleName::MANAGER, $transitionRoles, true)
                && !($fromStatus === AppraisalStatus::SELF_ASSESSMENT && $toStatus === AppraisalStatus::MANAGER_REVIEW);

            if ($isEscalatedExecutive && $isManagerSideTransition) {
                // Bypass role + ownership checks (escalation itself is
                // the authorisation), but still enforce the guard.
                $this->runGuardOrThrow($appraisal, $fromStatus, $toStatus);

                return;
            }

            $escalationProfile = $this->employees->findByUser($user);
            $isEscalationAppraisee = $escalationProfile !== null
                && $appraisal->getEmployee()->getId()->equals($escalationProfile->getId());
            if ($isManagerSideTransition
                && !$user->hasAdminRole()
                && !$isEscalatedExecutive
                && !$isEscalationAppraisee
                && $user->hasRole(RoleName::MANAGER)
            ) {
                throw new TransitionException(
                    'This appraisal has been escalated; the original manager can no longer perform write transitions.',
                    'WRONG_ROLE',
                );
            }
        }

        $allowedRoles = self::TRANSITION_ROLES[$fromStatus->value.'|'.$toStatus->value] ?? [];
        $profile = $this->employees->findByUser($user);
        $isOwnAppraisal = $profile !== null && $appraisal->getEmployee()->getId()->equals($profile->getId());

        // Appraisee override: the appraisee identity alone authorises any
        // transition the workflow permits an EMPLOYEE to call, regardless
        // of their broader role set (e.g. an HR_OFFICER appraisee acting
        // on their own appraisal). Confined to EMPLOYEE-allowed
        // transitions so it can't, e.g., let an appraisee drive
        // SIGNED_OFF -> FINALISED.
        if ($isOwnAppraisal && in_array(RoleName::EMPLOYEE, $allowedRoles, true)) {
            $this->runGuardOrThrow($appraisal, $fromStatus, $toStatus);

            return;
        }

        if (!$this->hasAnyRole($user, $allowedRoles)) {
            throw new TransitionException('You do not have the required role for this transition.', 'WRONG_ROLE');
        }

        if (!$this->checkOwnership($appraisal, $fromStatus, $toStatus, $user, $allowedRoles, $profile)) {
            throw new TransitionException('You do not have permission to transition this appraisal.', 'WRONG_ROLE');
        }

        $this->runGuardOrThrow($appraisal, $fromStatus, $toStatus);
    }

    private function runGuardOrThrow(Appraisal $appraisal, AppraisalStatus $from, AppraisalStatus $to): void
    {
        $reason = $this->guards->run($appraisal, $from, $to);
        if ($reason !== null) {
            throw new TransitionException($reason, 'GUARD_FAILED');
        }
    }

    /**
     * @param list<RoleName> $roles
     */
    private function hasAnyRole(User $user, array $roles): bool
    {
        foreach ($roles as $role) {
            if ($user->hasRole($role)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Port of _check_ownership: admin tier bypasses; the appraisee
     * passes for transitions allowing EMPLOYEE or MANAGER (a manager can
     * also be an appraisee on their own appraisal); the appraisee's
     * direct manager passes for MANAGER-allowed transitions except
     * SELF_ASSESSMENT -> MANAGER_REVIEW (only the appraisee submits
     * their own self-assessment).
     *
     * @param list<RoleName> $allowedRoles
     */
    private function checkOwnership(
        Appraisal $appraisal,
        AppraisalStatus $from,
        AppraisalStatus $to,
        User $user,
        array $allowedRoles,
        ?Employee $profile,
    ): bool {
        if ($user->hasAdminRole()) {
            return true;
        }

        if ($profile !== null && $profile->getId()->equals($appraisal->getEmployee()->getId())) {
            $appraiseeRoles = [RoleName::EMPLOYEE, RoleName::MANAGER];
            $rolesAllowAppraisee = array_intersect($appraiseeRoles, $allowedRoles) !== [];
            $userHasAppraiseeRole = $this->hasAnyRole($user, $appraiseeRoles);
            if ($rolesAllowAppraisee && $userHasAppraiseeRole) {
                return true;
            }
        }

        if (in_array(RoleName::MANAGER, $allowedRoles, true) && $user->hasRole(RoleName::MANAGER)) {
            if (!($from === AppraisalStatus::SELF_ASSESSMENT && $to === AppraisalStatus::MANAGER_REVIEW)) {
                $manager = $appraisal->getEmployee()->getManager();
                if ($profile !== null && $manager !== null && $manager->getId()->equals($profile->getId())) {
                    return true;
                }
            }
        }

        return false;
    }
}
