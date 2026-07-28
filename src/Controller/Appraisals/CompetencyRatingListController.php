<?php

declare(strict_types=1);

namespace App\Controller\Appraisals;

use App\Entity\CompetencyRating;
use App\Entity\User;
use App\Repository\AppraisalRepository;
use App\Repository\CompetencyRatingRepository;
use App\Service\CompetencyRatingResponseBuilder;
use App\Service\OffsetPaginationLinkBuilder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of CompetencyRatingViewSet.list(). Read access: appraisee, their
 * manager, HR Admin, Executive (AppraisalRepository::canUserRead) — the
 * frontend's listCompetencies() discards the pagination envelope since
 * a ratings-per-appraisal count is always well under one page (<=17).
 */
final class CompetencyRatingListController
{
    private const DEFAULT_PAGE_SIZE = 20;
    private const MAX_PAGE_SIZE = 100;

    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly CompetencyRatingRepository $competencyRatings,
        private readonly CompetencyRatingResponseBuilder $responseBuilder,
        private readonly OffsetPaginationLinkBuilder $pagination,
    ) {
    }

    #[Route('/api/v1/appraisals/{appraisalId}/competencies/', name: 'appraisal_competency_ratings_list', methods: ['GET'], requirements: ['appraisalId' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $appraisalId, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $appraisal = $this->appraisals->findById($appraisalId);
        if ($appraisal === null) {
            throw new NotFoundHttpException();
        }

        if (!$this->appraisals->canUserRead($user, $appraisal)) {
            return new JsonResponse(['detail' => 'You do not have permission to view this appraisal.'], 403);
        }

        $page = max(1, (int) $request->query->get('page', '1'));
        $pageSize = min(self::MAX_PAGE_SIZE, max(1, (int) $request->query->get('page_size', (string) self::DEFAULT_PAGE_SIZE)));

        $result = $this->competencyRatings->findByAppraisalPaginated($appraisal, $page, $pageSize);

        return new JsonResponse([
            'results' => array_map(fn (CompetencyRating $cr) => $this->responseBuilder->build($cr), $result['items']),
            'pagination' => $this->pagination->build($request, $result['count'], $page, $pageSize),
        ]);
    }
}
