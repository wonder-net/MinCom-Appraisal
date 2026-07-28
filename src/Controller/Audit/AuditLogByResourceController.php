<?php

declare(strict_types=1);

namespace App\Controller\Audit;

use App\Service\AuditCursorPaginator;
use App\Service\AuditLogResponseBuilder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Port of AuditLogByResourceView. HR staff only (see AuditLogListController).
 * Unlike the main list endpoint, this queryset is filtered ONLY by the
 * URL's resource_type/resource_id — Django's get_queryset() ignores
 * any other query params here, matched exactly (no `action`/`user_id`/
 * date-range filters applied even if supplied).
 *
 * resource_type: max 100 chars, `^[a-zA-Z0-9_]+$` only (400 otherwise).
 * resource_id: must parse as a UUID (400 otherwise). Neither is
 * constrained at the route-requirement level — like Django's
 * `<str:...>` URL converters, any non-slash segment reaches this
 * controller so the 400s below actually fire, rather than a 404 from
 * routing rejecting the path shape first.
 */
#[IsGranted('IS_HR_STAFF')]
final class AuditLogByResourceController
{
    private const MAX_RESOURCE_TYPE_LENGTH = 100;
    private const RESOURCE_TYPE_PATTERN = '/^[a-zA-Z0-9_]+$/';

    public function __construct(
        private readonly AuditCursorPaginator $paginator,
        private readonly AuditLogResponseBuilder $responseBuilder,
    ) {
    }

    #[Route('/api/v1/audit/logs/{resourceType}/{resourceId}/', name: 'audit_log_by_resource', methods: ['GET'])]
    public function __invoke(string $resourceType, string $resourceId, Request $request): JsonResponse
    {
        if (strlen($resourceType) > self::MAX_RESOURCE_TYPE_LENGTH) {
            return new JsonResponse(['detail' => 'resource_type must not exceed 100 characters.'], 400);
        }
        if (!preg_match(self::RESOURCE_TYPE_PATTERN, $resourceType)) {
            return new JsonResponse(['detail' => 'resource_type contains invalid characters.'], 400);
        }
        if (!Uuid::isValid($resourceId)) {
            return new JsonResponse(['detail' => 'resource_id must be a valid UUID.'], 400);
        }

        $filters = ['resourceType' => $resourceType, 'resourceId' => Uuid::fromString($resourceId)];

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
