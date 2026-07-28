<?php

declare(strict_types=1);

namespace App\Controller\Audit;

use App\Service\AuditCursorPaginator;
use App\Service\AuditLogFilterParser;
use App\Service\AuditLogResponseBuilder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of AuditLogListView. HR staff only (admin tier or HR_OFFICER —
 * no EXECUTIVE, matching Django's IsHRStaff). Read-only: only a GET
 * route is registered, so POST/DELETE 404 at the routing layer exactly
 * like Django's ListAPIView rejects them with 405.
 */
#[IsGranted('IS_HR_STAFF')]
final class AuditLogListController
{
    public function __construct(
        private readonly AuditLogFilterParser $filterParser,
        private readonly AuditCursorPaginator $paginator,
        private readonly AuditLogResponseBuilder $responseBuilder,
    ) {
    }

    #[Route('/api/v1/audit/logs/', name: 'audit_log_list', methods: ['GET'])]
    public function __invoke(Request $request): JsonResponse
    {
        $filters = $this->filterParser->parse($request);

        $page = $this->paginator->paginate($request, $filters);
        if ($page === null) {
            return new JsonResponse(['detail' => 'Invalid cursor.'], 400);
        }

        return new JsonResponse([
            'results' => $this->responseBuilder->buildMany($page['items']),
            'pagination' => [
                'next' => $page['next'],
                'previous' => $page['previous'],
            ],
        ]);
    }
}
