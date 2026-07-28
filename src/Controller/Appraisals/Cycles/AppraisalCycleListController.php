<?php

declare(strict_types=1);

namespace App\Controller\Appraisals\Cycles;

use App\Entity\AppraisalCycle;
use App\Entity\User;
use App\Repository\AppraisalCycleRepository;
use App\Service\AppraisalCycleResponseBuilder;
use App\Service\CycleListCache;
use App\Service\OffsetPaginationLinkBuilder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of AppraisalCycleViewSet.list(): HR Admin/SYSTEM_ADMIN/HR_OFFICER
 * see all cycles; everyone else sees ACTIVE only. Cache-aside, 1800s TTL.
 */
final class AppraisalCycleListController
{
    private const DEFAULT_PAGE_SIZE = 20;
    private const MAX_PAGE_SIZE = 100;

    public function __construct(
        private readonly AppraisalCycleRepository $cycles,
        private readonly AppraisalCycleResponseBuilder $responseBuilder,
        private readonly CycleListCache $cache,
        private readonly OffsetPaginationLinkBuilder $pagination,
    ) {
    }

    #[Route('/api/v1/appraisals/cycles/', name: 'appraisal_cycles_list', methods: ['GET'])]
    public function __invoke(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $orgWide = $this->cycles->hasOrgWideVisibility($user);

        $cached = $this->cache->get($orgWide);
        if ($cached !== null) {
            return new JsonResponse($cached);
        }

        $page = max(1, (int) $request->query->get('page', '1'));
        $pageSize = min(self::MAX_PAGE_SIZE, max(1, (int) $request->query->get('page_size', (string) self::DEFAULT_PAGE_SIZE)));

        $result = $this->cycles->scopedList($user, $page, $pageSize);

        $payload = [
            'results' => array_map(fn (AppraisalCycle $c) => $this->responseBuilder->build($c), $result['items']),
            'pagination' => $this->pagination->build($request, $result['count'], $page, $pageSize),
        ];

        $this->cache->set($orgWide, $payload);

        return new JsonResponse($payload);
    }
}
