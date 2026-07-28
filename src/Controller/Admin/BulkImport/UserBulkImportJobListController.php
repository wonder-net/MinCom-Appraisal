<?php

declare(strict_types=1);

namespace App\Controller\Admin\BulkImport;

use App\BulkImport\UserBulkImportJobResponseBuilder;
use App\Entity\UserBulkImportJob;
use App\Repository\UserBulkImportJobRepository;
use App\Repository\UserRepository;
use App\Service\OffsetPaginationLinkBuilder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.accounts.views.UserBulkImportJobCreateListView.get()
 * (TASK-304): paginated list of jobs, optionally filtered by created_by.
 */
#[IsGranted('IS_ADMIN')]
final class UserBulkImportJobListController
{
    private const DEFAULT_PAGE_SIZE = 20;
    private const MAX_PAGE_SIZE = 100;

    public function __construct(
        private readonly UserBulkImportJobRepository $jobs,
        private readonly UserRepository $users,
        private readonly UserBulkImportJobResponseBuilder $responseBuilder,
        private readonly OffsetPaginationLinkBuilder $pagination,
    ) {
    }

    #[Route('/api/v1/admin/users/bulk-import/jobs/', name: 'admin_user_bulk_import_jobs_list', methods: ['GET'])]
    public function __invoke(Request $request): JsonResponse
    {
        $createdByParam = $request->query->get('created_by');
        $createdBy = null;
        if ($createdByParam !== null) {
            if (!Uuid::isValid($createdByParam)) {
                return new JsonResponse(['detail' => 'Invalid created_by query parameter.'], 400);
            }
            $createdBy = $this->users->find(Uuid::fromString($createdByParam));
            if ($createdBy === null) {
                return new JsonResponse(['results' => [], 'pagination' => ['count' => 0, 'next' => null, 'previous' => null, 'page_size' => self::DEFAULT_PAGE_SIZE]]);
            }
        }

        $page = max(1, (int) $request->query->get('page', '1'));
        $pageSize = min(self::MAX_PAGE_SIZE, max(1, (int) $request->query->get('page_size', (string) self::DEFAULT_PAGE_SIZE)));

        $result = $this->jobs->search($createdBy, $page, $pageSize);

        return new JsonResponse([
            'results' => array_map(fn (UserBulkImportJob $job) => $this->responseBuilder->build($job), $result['items']),
            'pagination' => $this->pagination->build($request, $result['count'], $page, $pageSize),
        ]);
    }
}
