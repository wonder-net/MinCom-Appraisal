<?php

declare(strict_types=1);

namespace App\Controller\Appraisals;

use App\Entity\CompetencyRating;
use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Repository\AppraisalRepository;
use App\Repository\CompetencyRatingRepository;
use App\Repository\SubCompetencyRatingRepository;
use App\Service\AppraisalAccessChecker;
use App\Service\ScoreEngine;
use App\Service\SubCompetencyRatingResponseBuilder;
use App\Validation\ValidationErrorFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Rates one sub-competency under a core value (see SubCompetency's
 * docblock) — the sub-item equivalent of CompetencyRatingUpdateController,
 * with the same permission windows (appraisee self-rates during
 * SELF_ASSESSMENT when self_rating_enabled; either appraiser rates
 * during MANAGER_REVIEW/DISCUSSION/DISPUTED).
 *
 * Unlike the flat 1.0-7.5-in-0.5-steps scale that direct competency
 * ratings use, a sub-competency's ceiling (`maxScore`) is whatever
 * equal share of 7.5 it was frozen to at appraisal-creation time
 * (SubCompetencyWeightCalculator) — not always a "nice" number (e.g.
 * 7.5/7 = 1.07), so the only validation here is the range [0, maxScore]
 * at 2 decimal places, no fixed increment.
 *
 * After a successful write, rolls the sum back up onto the PARENT
 * CompetencyRating's same-side field — but ONLY once every sibling
 * sub-competency has a rating on that side, otherwise leaves it null.
 * That's what ScoreEngine::calculateBcPoints() actually sums, so
 * ScoreEngine itself needed no changes for sub-competencies to work;
 * this controller just re-invokes it after a manager-side rollup,
 * exactly like CompetencyRatingUpdateController does.
 */
final class SubCompetencyRatingUpdateController
{
    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly CompetencyRatingRepository $competencyRatings,
        private readonly SubCompetencyRatingRepository $subCompetencyRatings,
        private readonly AppraisalAccessChecker $access,
        private readonly SubCompetencyRatingResponseBuilder $responseBuilder,
        private readonly ScoreEngine $scoreEngine,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route(
        '/api/v1/appraisals/{appraisalId}/competencies/{competencyRatingId}/sub-competencies/{id}/',
        name: 'appraisal_sub_competency_ratings_update',
        methods: ['PATCH'],
        requirements: ['appraisalId' => '[0-9a-fA-F-]{36}', 'competencyRatingId' => '[0-9a-fA-F-]{36}', 'id' => '[0-9a-fA-F-]{36}'],
    )]
    public function __invoke(string $appraisalId, string $competencyRatingId, string $id, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $appraisal = $this->appraisals->findById($appraisalId);
        if ($appraisal === null) {
            throw new NotFoundHttpException();
        }

        $competencyRating = $this->competencyRatings->findOneByAppraisalAndId($appraisal, $competencyRatingId);
        if ($competencyRating === null) {
            throw new NotFoundHttpException();
        }

        $rating = $this->subCompetencyRatings->findOneByCompetencyRatingAndId($competencyRating, $id);
        if ($rating === null) {
            throw new NotFoundHttpException();
        }

        $payload = json_decode($request->getContent(), true) ?? [];
        $isAppraisee = $this->access->isAppraisee($user, $appraisal);
        $isManager = $this->access->isAnyAppraiserOf($user, $appraisal);

        $canSelfRate = $isAppraisee
            && $appraisal->getStatus() === AppraisalStatus::SELF_ASSESSMENT
            && $appraisal->getCycle()->isSelfRatingEnabled();

        $canManagerRate = $isManager && in_array($appraisal->getStatus(), [
            AppraisalStatus::MANAGER_REVIEW,
            AppraisalStatus::DISCUSSION,
            AppraisalStatus::DISPUTED,
        ], true);

        if (!$canSelfRate && !$canManagerRate) {
            return new JsonResponse(['detail' => 'You do not have permission to perform this action.'], 403);
        }

        $field = $canSelfRate ? 'self_rating' : 'manager_rating';
        $errors = [];

        if (!isset($payload[$field]) || !is_numeric($payload[$field])) {
            $errors[$field] = 'This field is required.';
        } else {
            $error = $this->validateRatingRange((string) $payload[$field], $rating->getMaxScore());
            if ($error !== null) {
                $errors[$field] = $error;
            }
        }

        if ($errors !== []) {
            throw ValidationErrorFactory::fields($errors);
        }

        $normalized = $this->normalizeRating((string) $payload[$field]);
        if ($canSelfRate) {
            $rating->setSelfRating($normalized);
        } else {
            $rating->setManagerRating($normalized);
        }

        $this->em->flush();

        $this->rollUpToParent($competencyRating, $canSelfRate);

        if (!$canSelfRate) {
            $this->scoreEngine->computeScores($appraisal);
        }

        return new JsonResponse($this->responseBuilder->build($rating));
    }

    /**
     * Recomputes the parent CompetencyRating's self_rating/manager_rating
     * as the SUM of its sub-competency ratings on that side — but only
     * once every sibling has one, otherwise leaves it null (matching
     * how an un-rated direct CompetencyRating is null, not zero, so
     * ScoreEngine's allManagerRatingsPresent() check still works
     * unmodified).
     */
    private function rollUpToParent(CompetencyRating $competencyRating, bool $isSelfSide): void
    {
        $siblings = $this->subCompetencyRatings->findByCompetencyRatingOrdered($competencyRating);

        $sum = '0';
        foreach ($siblings as $sibling) {
            $value = $isSelfSide ? $sibling->getSelfRating() : $sibling->getManagerRating();
            if ($value === null) {
                if ($isSelfSide) {
                    $competencyRating->setSelfRating(null);
                } else {
                    $competencyRating->setManagerRating(null);
                }
                $this->em->flush();

                return;
            }
            $sum = bcadd($sum, $value, 2);
        }

        if ($isSelfSide) {
            $competencyRating->setSelfRating($sum);
        } else {
            $competencyRating->setManagerRating($sum);
        }
        $this->em->flush();
    }

    private function normalizeRating(string $raw): string
    {
        return bcadd($raw, '0', 2);
    }

    private function validateRatingRange(string $rating, string $maxScore): ?string
    {
        if (bccomp($rating, '0', 2) < 0 || bccomp($rating, $maxScore, 2) > 0) {
            return sprintf('Rating must be between 0 and %s.', $maxScore);
        }

        return null;
    }
}
