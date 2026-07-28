<?php

declare(strict_types=1);

namespace App\Controller\Appraisals;

use App\Entity\Appraisal;
use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Repository\AppraisalRepository;
use App\Service\AppraisalResponseBuilder;
use App\Service\OffsetPaginationLinkBuilder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

/**
 * Port of AppraisalViewSet.list()/get_queryset(): RBAC-scoped (org-wide
 * readers see all; MANAGER sees self + direct reports; everyone else sees
 * only their own), with optional cycle_id/status/search filters.
 */
final class AppraisalListController
{
    private const SEARCH_MAX_LENGTH = 100;
    private const DEFAULT_PAGE_SIZE = 20;
    private const MAX_PAGE_SIZE = 100;

    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly AppraisalResponseBuilder $responseBuilder,
        private readonly OffsetPaginationLinkBuilder $pagination,
    ) {
    }

    #[Route('/api/v1/appraisals/', name: 'appraisals_list', methods: ['GET'])]
    public function __invoke(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $cycleId = $request->query->get('cycle_id');
        if ($cycleId !== null && !Uuid::isValid($cycleId)) {
            return new JsonResponse(['detail' => 'Invalid cycle_id parameter. Must be a valid UUID.'], 400);
        }

        $statusFilter = null;
        $statusParam = $request->query->get('status');
        if ($statusParam !== null) {
            $statusFilter = AppraisalStatus::tryFrom($statusParam);
            if ($statusFilter === null) {
                $validValues = array_map(static fn (AppraisalStatus $s) => $s->value, AppraisalStatus::cases());
                sort($validValues);

                return new JsonResponse(['detail' => sprintf('Invalid status parameter. Must be one of: %s.', implode(', ', $validValues))], 400);
            }
        }

        $searchParam = (string) $request->query->get('search', '');
        if (strlen($searchParam) > self::SEARCH_MAX_LENGTH) {
            return new JsonResponse(['detail' => 'Search term must not exceed 100 characters.'], 400);
        }

        $page = max(1, (int) $request->query->get('page', '1'));
        $pageSize = min(self::MAX_PAGE_SIZE, max(1, (int) $request->query->get('page_size', (string) self::DEFAULT_PAGE_SIZE)));

        $result = $this->appraisals->scopedList($user, $cycleId, $statusFilter, $searchParam !== '' ? $searchParam : null, $page, $pageSize);

        return new JsonResponse([
            'results' => array_map(fn (Appraisal $a) => $this->responseBuilder->buildList($a), $result['items']),
            'pagination' => $this->pagination->build($request, $result['count'], $page, $pageSize),
        ]);
    }
}
