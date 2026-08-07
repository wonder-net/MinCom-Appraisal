<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Appraisal;
use App\Entity\Comment;
use App\Enum\AppraisalPartyRole;
use App\Enum\AppraisalStatus;
use App\Enum\StrengthWeaknessType;
use App\Repository\CommentRepository;
use App\Repository\CompetencyRatingRepository;
use App\Repository\GrowthPlanRepository;
use App\Repository\KeyDeliverableRepository;
use App\Repository\SignatureRepository;
use App\Repository\StrengthWeaknessRepository;
use App\Repository\TrainingNeedRepository;

/**
 * Port of the five pure guard functions in apps.appraisals.workflow
 * (_guard_self_assessment_to_manager_review, _guard_manager_review_to_discussion,
 * _guard_discussion_to_growth_planning, _guard_growth_planning_to_pending_signoff,
 * _guard_pending_signoff_to_signed_off) plus their data-fetching
 * counterparts, collapsed into one service since the per-appraisal
 * dataset (KDs, competency ratings, comments, signatures) is always
 * small (<=17 rows) — counting/summing in PHP over an already-fetched
 * list avoids needing new DQL aggregate queries per guard.
 */
final class WorkflowGuardService
{
    private const WEIGHT_TOLERANCE = '0.001';
    private const BC_SCALE = 10;

    public function __construct(
        private readonly KeyDeliverableRepository $keyDeliverables,
        private readonly CompetencyRatingRepository $competencyRatings,
        private readonly CommentRepository $comments,
        private readonly SignatureRepository $signatures,
        private readonly GrowthPlanRepository $growthPlans,
        private readonly StrengthWeaknessRepository $strengthsWeaknesses,
        private readonly TrainingNeedRepository $trainingNeeds,
        private readonly AppraisalAccessChecker $access,
        private readonly CalibrationService $calibration,
    ) {
    }

    /**
     * @return string|null the failure reason, or null if the guard passes
     */
    public function run(Appraisal $appraisal, AppraisalStatus $from, AppraisalStatus $to): ?string
    {
        return match (true) {
            $from === AppraisalStatus::SELF_ASSESSMENT && $to === AppraisalStatus::MANAGER_REVIEW => $this->selfAssessmentToManagerReview($appraisal),
            $from === AppraisalStatus::MANAGER_REVIEW && $to === AppraisalStatus::DISCUSSION => $this->managerReviewToDiscussion($appraisal),
            $from === AppraisalStatus::DISCUSSION && $to === AppraisalStatus::GROWTH_PLANNING => $this->discussionToGrowthPlanning($appraisal),
            $from === AppraisalStatus::GROWTH_PLANNING && $to === AppraisalStatus::PENDING_SIGNOFF => $this->growthPlanningToPendingSignoff($appraisal),
            $from === AppraisalStatus::PENDING_SIGNOFF && $to === AppraisalStatus::SIGNED_OFF => $this->pendingSignoffToSignedOff($appraisal),
            // Calibration (product roadmap item, see CalibrationSession's
            // docblock): this is one of THREE paths that can reach
            // FINALISED — AppraisalCycleFinaliseAllController and
            // AppraisalBulkFinaliseController's own bulk paths carry the
            // identical CalibrationService::isComplete() check directly,
            // since neither of them goes through this guard at all.
            $from === AppraisalStatus::SIGNED_OFF && $to === AppraisalStatus::FINALISED => $this->signedOffToFinalised($appraisal),
            // All other valid transitions have no guard (DISPUTED->DISCUSSION,
            // PENDING_SIGNOFF->DISPUTED).
            default => null,
        };
    }

    private function selfAssessmentToManagerReview(Appraisal $appraisal): ?string
    {
        $kds = $this->keyDeliverables->findAllByAppraisal($appraisal);
        if ($kds === []) {
            return 'No key deliverables exist for this appraisal.';
        }

        $weightsSum = '0';
        $missingKdSelfRating = 0;
        foreach ($kds as $kd) {
            $weightsSum = bcadd($weightsSum, $kd->getWeight(), self::BC_SCALE);
            if ($kd->getSelfRating() === null) {
                ++$missingKdSelfRating;
            }
        }

        if ($this->absDiffExceeds($weightsSum, '1.0', self::WEIGHT_TOLERANCE)) {
            return sprintf(
                'Key deliverable weights must total 100%% (current total: %d%%).',
                (int) round(((float) $weightsSum) * 100),
            );
        }

        if ($appraisal->getCycle()->isSelfRatingEnabled()) {
            $missingCrSelfRating = 0;
            foreach ($this->competencyRatings->findByAppraisalOrdered($appraisal) as $cr) {
                if ($cr->getSelfRating() === null) {
                    ++$missingCrSelfRating;
                }
            }

            $failures = [];
            if ($missingKdSelfRating > 0) {
                $failures[] = sprintf('%d key deliverable(s) missing self rating.', $missingKdSelfRating);
            }
            if ($missingCrSelfRating > 0) {
                $failures[] = sprintf('%d competency rating(s) missing self rating.', $missingCrSelfRating);
            }
            if ($failures !== []) {
                return implode(' ', $failures);
            }
        }

        return null;
    }

    private function managerReviewToDiscussion(Appraisal $appraisal): ?string
    {
        $missingKd = 0;
        foreach ($this->keyDeliverables->findAllByAppraisal($appraisal) as $kd) {
            if ($kd->getManagerRating() === null) {
                ++$missingKd;
            }
        }

        $missingCr = 0;
        foreach ($this->competencyRatings->findByAppraisalOrdered($appraisal) as $cr) {
            if ($cr->getManagerRating() === null) {
                ++$missingCr;
            }
        }

        $failures = [];
        if ($missingKd > 0) {
            $failures[] = sprintf('%d key deliverable(s) missing manager rating.', $missingKd);
        }
        if ($missingCr > 0) {
            $failures[] = sprintf('%d competency rating(s) missing manager rating.', $missingCr);
        }

        return $failures === [] ? null : implode(' ', $failures);
    }

    private function discussionToGrowthPlanning(Appraisal $appraisal): ?string
    {
        $since = $appraisal->getStatusChangedAt();
        $comments = $this->comments->findByAppraisalOrdered($appraisal);
        if ($since !== null) {
            $comments = array_filter($comments, static fn (Comment $c) => $c->getCreatedAt() >= $since);
        }

        $hasAppraiseeComment = false;
        $hasManagerComment = false;
        foreach ($comments as $comment) {
            if ($comment->getAuthorRole() === AppraisalPartyRole::APPRAISEE) {
                $hasAppraiseeComment = true;
            }
            if ($comment->getAuthorRole() === AppraisalPartyRole::APPRAISER) {
                $hasManagerComment = true;
            }
        }

        $missing = [];
        if (!$hasAppraiseeComment) {
            $missing[] = 'appraisee';
        }
        if (!$hasManagerComment) {
            $missing[] = 'appraisor';
        }

        if ($missing !== []) {
            return sprintf(
                'The %s must add at least one comment before discussion can be marked as complete.',
                implode(' and ', $missing),
            );
        }

        return null;
    }

    /**
     * Port of _guard_growth_planning_to_pending_signoff /
     * _fetch_guard_data_for_growth_planning: requires at least one
     * strength, one weakness, and one training need on the linked
     * GrowthPlan.
     */
    private function growthPlanningToPendingSignoff(Appraisal $appraisal): ?string
    {
        $growthPlan = $this->growthPlans->findOneByAppraisal($appraisal);

        $hasStrength = $growthPlan !== null && $this->strengthsWeaknesses->existsByGrowthPlanAndType($growthPlan, StrengthWeaknessType::STRENGTH);
        $hasWeakness = $growthPlan !== null && $this->strengthsWeaknesses->existsByGrowthPlanAndType($growthPlan, StrengthWeaknessType::WEAKNESS);
        $hasTrainingNeed = $growthPlan !== null && $this->trainingNeeds->existsByGrowthPlan($growthPlan);

        $missing = [];
        if (!$hasStrength) {
            $missing[] = 'at least one strength';
        }
        if (!$hasWeakness) {
            $missing[] = 'at least one weakness';
        }
        if (!$hasTrainingNeed) {
            $missing[] = 'at least one training need';
        }

        return $missing === [] ? null : sprintf('Growth plan incomplete: requires %s.', implode(', ', $missing));
    }

    /**
     * HR change request #3: fixed from a flat "at least 2 accepts" count
     * (correct only when every appraisee always has exactly one
     * appraiser) to actually require the appraisee PLUS every assigned
     * appraiser (manager and, when set, matrix appraiser) — mirrors
     * SignAppraisalService's own completion check exactly, via the same
     * AppraisalAccessChecker::countRequiredAppraisers() this guard must
     * agree with, since this transition is also reachable directly
     * through the generic transition endpoint (AppraisalTransitionController),
     * which never goes through SignAppraisalService's stricter gate.
     */
    private function pendingSignoffToSignedOff(Appraisal $appraisal): ?string
    {
        $round = $appraisal->getSigningRound();
        $hasAppraiseeAccept = $this->signatures->hasAcceptForRoleAndRound($appraisal, AppraisalPartyRole::APPRAISEE, $round);
        $acceptedAppraisers = $this->signatures->countDistinctAcceptedAppraisersForRound($appraisal, $round);
        $requiredAppraisers = $this->access->countRequiredAppraisers($appraisal);

        return $hasAppraiseeAccept && $acceptedAppraisers >= $requiredAppraisers
            ? null
            : 'The appraisee and every assigned appraiser must sign with ACCEPT before sign-off.';
    }

    /**
     * Calibration (product roadmap item, see CalibrationSession's
     * docblock): the appraisee's department must have a COMPLETE
     * calibration session for this cycle.
     */
    private function signedOffToFinalised(Appraisal $appraisal): ?string
    {
        return $this->calibration->isComplete($appraisal)
            ? null
            : 'This employee\'s department has not completed calibration for this cycle yet.';
    }

    private function absDiffExceeds(string $a, string $b, string $tolerance): bool
    {
        $diff = bcsub($a, $b, self::BC_SCALE);
        $absDiff = bccomp($diff, '0', self::BC_SCALE) < 0 ? bcmul($diff, '-1', self::BC_SCALE) : $diff;

        return bccomp($absDiff, $tolerance, self::BC_SCALE) > 0;
    }
}
