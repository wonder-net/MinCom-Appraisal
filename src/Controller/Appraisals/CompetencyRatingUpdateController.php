<?php

declare(strict_types=1);

namespace App\Controller\Appraisals;

use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Repository\AppraisalRepository;
use App\Repository\CompetencyRatingRepository;
use App\Repository\SubCompetencyRatingRepository;
use App\Service\AppraisalAccessChecker;
use App\Service\CompetencyRatingResponseBuilder;
use App\Service\ScoreEngine;
use App\Validation\ValidationErrorFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of CompetencyRatingViewSet.partial_update(). Appraisee sets
 * self_rating during SELF_ASSESSMENT (only when cycle.self_rating_enabled
 * is True); either appraiser (manager or matrix appraiser — HR change
 * request #3) sets manager_rating during MANAGER_REVIEW, DISCUSSION, or
 * DISPUTED. Ratings are 1.0-7.5 in 0.5 increments (HR change request
 * #8) — see validateRatingRange().
 *
 * Rejects the PATCH entirely (400) when this core value has
 * sub-competencies (SubCompetency) — a competency with sub-items must
 * be rated per sub-item via SubCompetencyRatingUpdateController, which
 * rolls the sum back up onto this same self_rating/manager_rating
 * field itself; a direct write here would silently overwrite that
 * roll-up and let the "shares sum to 7.5" invariant drift.
 */
final class CompetencyRatingUpdateController
{
    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly CompetencyRatingRepository $competencyRatings,
        private readonly SubCompetencyRatingRepository $subCompetencyRatings,
        private readonly AppraisalAccessChecker $access,
        private readonly CompetencyRatingResponseBuilder $responseBuilder,
        private readonly ScoreEngine $scoreEngine,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/v1/appraisals/{appraisalId}/competencies/{id}/', name: 'appraisal_competency_ratings_update', methods: ['PATCH'], requirements: ['appraisalId' => '[0-9a-fA-F-]{36}', 'id' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $appraisalId, string $id, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $appraisal = $this->appraisals->findById($appraisalId);
        if ($appraisal === null) {
            throw new NotFoundHttpException();
        }

        $rating = $this->competencyRatings->findOneByAppraisalAndId($appraisal, $id);
        if ($rating === null) {
            throw new NotFoundHttpException();
        }

        if ($this->subCompetencyRatings->findByCompetencyRatingOrdered($rating) !== []) {
            return new JsonResponse(['detail' => 'This core value is rated per sub-competency; PATCH the individual sub-competency ratings instead.'], 400);
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

        $errors = [];

        if ($canSelfRate) {
            if (!isset($payload['self_rating']) || !is_numeric($payload['self_rating'])) {
                $errors['self_rating'] = 'This field is required.';
            } else {
                $error = $this->validateRatingRange((string) $payload['self_rating']);
                if ($error !== null) {
                    $errors['self_rating'] = $error;
                }
            }
        } else {
            if (!isset($payload['manager_rating']) || !is_numeric($payload['manager_rating'])) {
                $errors['manager_rating'] = 'This field is required.';
            } else {
                $error = $this->validateRatingRange((string) $payload['manager_rating']);
                if ($error !== null) {
                    $errors['manager_rating'] = $error;
                }
            }
        }

        if ($errors !== []) {
            throw ValidationErrorFactory::fields($errors);
        }

        if ($canSelfRate) {
            $rating->setSelfRating($this->normalizeRating((string) $payload['self_rating']));
        } else {
            $rating->setManagerRating($this->normalizeRating((string) $payload['manager_rating']));
        }

        $this->em->flush();

        if (array_key_exists('manager_rating', $payload)) {
            $this->scoreEngine->computeScores($appraisal);
        }

        return new JsonResponse($this->responseBuilder->build($rating));
    }

    /**
     * Pads/truncates to the column's 2 decimal places (e.g. "4.5" ->
     * "4.50") so the in-memory entity value matches what gets persisted
     * — Doctrine doesn't reflect DB-side rounding back onto the object
     * without an explicit refresh.
     */
    private function normalizeRating(string $raw): string
    {
        return bcadd($raw, '0', 2);
    }

    /**
     * HR change request #8: Mincom Core Value ratings are 1.0-7.5 in 0.5
     * increments (each rating is a direct point contribution toward the
     * 30-point core-values total — see ScoreEngine), not the old 1.0-5.0
     * scale.
     */
    private function validateRatingRange(string $rating): ?string
    {
        if (bccomp($rating, '1.0', 2) < 0 || bccomp($rating, '7.5', 2) > 0) {
            return sprintf('Rating must be between %s and %s.', '1.0', '7.5');
        }

        if (bccomp(bcmod($rating, '0.5', 2), '0', 2) !== 0) {
            return 'Rating must be in increments of 0.5 (e.g. 1.0, 1.5, 2.0, ... 7.5).';
        }

        return null;
    }
}
