<?php

declare(strict_types=1);

namespace App\Controller\Admin\BulkImport;

use App\Entity\User;
use App\Repository\BulkImportJobRepository;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.accounts.views.AdminBulkImportResultsView.
 */
#[IsGranted('IS_ADMIN')]
final class AdminBulkImportResultsController
{
    public function __construct(private readonly BulkImportJobRepository $jobs)
    {
    }

    #[Route('/api/v1/admin/users/bulk-import/{importId}/results/', name: 'admin_bulk_import_results', methods: ['GET'])]
    public function __invoke(string $importId, #[CurrentUser] User $user): JsonResponse
    {
        $job = Uuid::isValid($importId) ? $this->jobs->find(Uuid::fromString($importId)) : null;
        if ($job === null || $job->getCreatedBy()->getId()->toRfc4122() !== (string) $user->getId()) {
            return new JsonResponse(['detail' => 'Import job not found.'], 404);
        }

        return new JsonResponse([
            'id' => (string) $job->getId(),
            'status' => $job->getStatus()->value,
            'total_rows' => $job->getTotalRows(),
            'created_count' => $job->getCreatedCount(),
            'failed_count' => $job->getFailedCount(),
            'failed_rows' => $job->getFailedRows(),
            'created_at' => $job->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'completed_at' => $job->getCompletedAt()?->format(\DateTimeInterface::ATOM),
        ]);
    }
}
