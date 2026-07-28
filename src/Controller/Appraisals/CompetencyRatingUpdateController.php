<?php

declare(strict_types=1);

namespace App\Controller\Appraisals;

use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Repository\AppraisalRepository;
use App\Repository\CompetencyRatingRepository;
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
 * is True); manager sets manager_rating during MANAGER_REVIEW,
 * DISCUSSION, or DISPUTED.
 */
final class CompetencyRatingUpdateController
{
    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly CompetencyRatingRepository $competencyRatings,
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

        $payload = json_decode($request->getContent(), true) ?? [];
        $isAppraisee = $this->access->isAppraisee($user, $appraisal);
        $isManager = $this->access->isManagerOf($user, $appraisal);

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
                $selfRating = (string) $payload['self_rating'];
                if (bccomp($selfRating, '1.0', 2) < 0 || bccomp($selfRating, '5.0', 2) > 0) {
                    $errors['self_rating'] = sprintf('Rating must be between %s and %s.', '1.0', '5.0');
                }
            }
        } else {
            if (!isset($payload['manager_rating']) || !is_numeric($payload['manager_rating'])) {
                $errors['manager_rating'] = 'This field is required.';
            } else {
                $managerRating = (string) $payload['manager_rating'];
                if (bccomp($managerRating, '1.0', 2) < 0 || bccomp($managerRating, '5.0', 2) > 0) {
                    $errors['manager_rating'] = sprintf('Rating must be between %s and %s.', '1.0', '5.0');
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
}
