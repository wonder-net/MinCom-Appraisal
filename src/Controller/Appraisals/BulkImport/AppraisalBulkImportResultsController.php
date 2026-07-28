<?php

declare(strict_types=1);

namespace App\Controller\Appraisals\BulkImport;

use App\Entity\User;
use App\Repository\AppraisalBulkImportJobRepository;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Port of AppraisalBulkImportResultsView. Scoped by created_by, same
 * as the confirm endpoint.
 */
#[IsGranted('IS_ADMIN')]
final class AppraisalBulkImportResultsController
{
    public function __construct(private readonly AppraisalBulkImportJobRepository $jobs)
    {
    }

    #[Route('/api/v1/appraisals/bulk-import/{importId}/results/', name: 'appraisal_bulk_import_results', methods: ['GET'])]
    public function __invoke(string $importId, #[CurrentUser] User $user): JsonResponse
    {
        $job = Uuid::isValid($importId) ? $this->jobs->find(Uuid::fromString($importId)) : null;
        if ($job === null || !$job->getCreatedBy()->getId()->equals($user->getId())) {
            return new JsonResponse(['detail' => 'Import job not found.'], 404);
        }

        return new JsonResponse([
            'id' => (string) $job->getId(),
            'status' => $job->getStatus()->value,
            'target_status' => $job->getTargetStatus(),
            'total_files' => $job->getTotalFiles(),
            'imported_count' => $job->getImportedCount(),
            'failed_count' => $job->getFailedCount(),
            'failed_files' => $job->getFailedFiles(),
            'created_at' => $job->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'completed_at' => $job->getCompletedAt()?->format(\DateTimeInterface::ATOM),
        ]);
    }
}
