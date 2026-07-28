<?php

declare(strict_types=1);

namespace App\Controller\Admin\BulkImport;

use App\BulkImport\UserBulkImportJobResponseBuilder;
use App\Repository\UserBulkImportJobRepository;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.accounts.views.UserBulkImportJobDetailView. Any admin-tier
 * user may read any job (org-wide visibility), same as Django.
 */
#[IsGranted('IS_ADMIN')]
final class UserBulkImportJobDetailController
{
    public function __construct(
        private readonly UserBulkImportJobRepository $jobs,
        private readonly UserBulkImportJobResponseBuilder $responseBuilder,
    ) {
    }

    #[Route('/api/v1/admin/users/bulk-import/jobs/{jobId}/', name: 'admin_user_bulk_import_jobs_detail', methods: ['GET'])]
    public function __invoke(string $jobId): JsonResponse
    {
        $job = Uuid::isValid($jobId) ? $this->jobs->find(Uuid::fromString($jobId)) : null;
        if ($job === null) {
            return new JsonResponse(['detail' => 'Import job not found.'], 404);
        }

        return new JsonResponse($this->responseBuilder->build($job));
    }
}
