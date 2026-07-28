<?php

declare(strict_types=1);

namespace App\Controller\Admin\Competencies;

use App\Entity\Competency;
use App\Entity\User;
use App\Repository\CompetencyRepository;
use App\Service\CompetencyCache;
use App\Service\CompetencyResponseBuilder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of apps.competencies.views.AdminCompetencyListCreateView.get()/list().
 * Any authenticated user may list active competencies; HR Admin/SYSTEM_ADMIN
 * may additionally pass ?include_inactive=true to see deactivated records.
 * Cache-aside, 3600s TTL, matching Django's "competencies:active"/
 * "competencies:all" keys.
 */
final class AdminCompetencyListController
{
    public function __construct(
        private readonly CompetencyRepository $competencies,
        private readonly CompetencyResponseBuilder $responseBuilder,
        private readonly CompetencyCache $cache,
    ) {
    }

    #[Route('/api/v1/admin/competencies/', name: 'admin_competencies_list', methods: ['GET'])]
    public function __invoke(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $includeInactive = strtolower($request->query->get('include_inactive', '')) === 'true' && $user->hasAdminRole();

        $cached = $this->cache->get($includeInactive);
        if ($cached !== null) {
            return new JsonResponse($cached);
        }

        $competencies = array_map(
            fn (Competency $c) => $this->responseBuilder->build($c),
            $this->competencies->findAllOrderedBySortOrder($includeInactive),
        );

        $this->cache->set($includeInactive, $competencies);

        return new JsonResponse($competencies);
    }
}
