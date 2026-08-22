<?php

declare(strict_types=1);

namespace App\Controller\Appraisals;

use App\Entity\CompetencyRating;
use App\Entity\SubCompetencyRating;
use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Repository\AppraisalRepository;
use App\Repository\CompetencyRatingRepository;
use App\Repository\SubCompetencyRatingRepository;
use App\Service\AppraisalAccessChecker;
use App\Service\CompetencyRatingResponseBuilder;
use App\Service\ScoreEngine;
use App\Service\SubCompetencyWeightCalculator;
use App\Validation\ValidationErrorFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Lets the appraisee add their OWN sub-competency under a core value on
 * their own appraisal — per-appraisal only, never written back to HR's
 * master SubCompetency list (see SubCompetencyRating's docblock). Only
 * during SELF_ASSESSMENT with self-rating enabled — the same window
 * self-rating itself is allowed in — so this always runs before any
 * manager_rating could exist for the sibling rows it's about to reset.
 *
 * Works even when the competency currently has zero sub-competencies
 * (the legacy direct-rating path): adding the first one converts it to
 * itemized rating on the spot, same as if HR had pre-configured one.
 *
 * Adding a new item changes how many ways the parent's fixed 7.5-point
 * ceiling splits, so every sibling's `maxScore` is recomputed
 * (SubCompetencyWeightCalculator) and every existing rating on this
 * competency — self AND manager — is reset to null: whatever was
 * already entered no longer reflects the new split and needs redoing.
 * In practice manager_rating is always already null here (the manager
 * can't rate before MANAGER_REVIEW), so only self_rating is ever
 * actually lost.
 */
final class SubCompetencyRatingCreateController
{
    private const NAME_MAX_LENGTH = 200;

    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly CompetencyRatingRepository $competencyRatings,
        private readonly SubCompetencyRatingRepository $subCompetencyRatings,
        private readonly AppraisalAccessChecker $access,
        private readonly SubCompetencyWeightCalculator $weightCalculator,
        private readonly CompetencyRatingResponseBuilder $responseBuilder,
        private readonly ScoreEngine $scoreEngine,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route(
        '/api/v1/appraisals/{appraisalId}/competencies/{competencyRatingId}/sub-competencies/',
        name: 'appraisal_sub_competency_ratings_create',
        methods: ['POST'],
        requirements: ['appraisalId' => '[0-9a-fA-F-]{36}', 'competencyRatingId' => '[0-9a-fA-F-]{36}'],
    )]
    public function __invoke(string $appraisalId, string $competencyRatingId, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $appraisal = $this->appraisals->findById($appraisalId);
        if ($appraisal === null) {
            throw new NotFoundHttpException();
        }

        $competencyRating = $this->competencyRatings->findOneByAppraisalAndId($appraisal, $competencyRatingId);
        if ($competencyRating === null) {
            throw new NotFoundHttpException();
        }

        $canSelfRate = $this->access->isAppraisee($user, $appraisal)
            && $appraisal->getStatus() === AppraisalStatus::SELF_ASSESSMENT
            && $appraisal->getCycle()->isSelfRatingEnabled();

        if (!$canSelfRate) {
            return new JsonResponse(['detail' => 'You do not have permission to perform this action.'], 403);
        }

        $payload = json_decode($request->getContent(), true) ?? [];
        $name = is_string($payload['name'] ?? null) ? trim($payload['name']) : '';

        if ($name === '') {
            throw ValidationErrorFactory::field('name', 'This field is required.');
        }
        if (mb_strlen($name) > self::NAME_MAX_LENGTH) {
            throw ValidationErrorFactory::field('name', sprintf('Must be %d characters or fewer.', self::NAME_MAX_LENGTH));
        }
        if ($this->subCompetencyRatings->existsByCompetencyRatingAndNameCaseInsensitive($competencyRating, $name)) {
            throw ValidationErrorFactory::field('name', 'A sub-competency with this name already exists for this core value.');
        }

        $this->em->wrapInTransaction(function () use ($competencyRating, $name): void {
            $this->addAndReshare($competencyRating, $name);
        });

        $this->scoreEngine->computeScores($appraisal);

        return new JsonResponse($this->responseBuilder->build($competencyRating), 201);
    }

    private function addAndReshare(CompetencyRating $competencyRating, string $name): void
    {
        $siblings = $this->subCompetencyRatings->findByCompetencyRatingOrdered($competencyRating);
        $nextSortOrder = $siblings === [] ? 0 : max(array_map(static fn (SubCompetencyRating $s) => $s->getSortOrder(), $siblings)) + 1;

        $newRating = new SubCompetencyRating($competencyRating, null, $name, $nextSortOrder, '0.00');
        $this->em->persist($newRating);

        $all = [...$siblings, $newRating];
        $shares = $this->weightCalculator->computeShares(count($all));
        foreach ($all as $index => $subRating) {
            $subRating->setMaxScore($shares[$index]);
            $subRating->setSelfRating(null);
            $subRating->setManagerRating(null);
        }

        $competencyRating->setSelfRating(null);
        $competencyRating->setManagerRating(null);

        $this->em->flush();
    }
}
