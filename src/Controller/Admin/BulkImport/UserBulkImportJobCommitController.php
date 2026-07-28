<?php

declare(strict_types=1);

namespace App\Controller\Admin\BulkImport;

use App\BulkImport\UserBulkImportJobResponseBuilder;
use App\Enum\UserBulkImportJobStatus;
use App\Message\CommitUserBulkImportMessage;
use App\Repository\UserBulkImportJobRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.accounts.views.UserBulkImportJobCommitView (TASK-304).
 */
#[IsGranted('IS_ADMIN')]
final class UserBulkImportJobCommitController
{
    public function __construct(
        private readonly UserBulkImportJobRepository $jobs,
        private readonly UserBulkImportJobResponseBuilder $responseBuilder,
        private readonly EntityManagerInterface $em,
        private readonly MessageBusInterface $bus,
    ) {
    }

    #[Route('/api/v1/admin/users/bulk-import/jobs/{jobId}/commit/', name: 'admin_user_bulk_import_jobs_commit', methods: ['POST'])]
    public function __invoke(string $jobId): JsonResponse
    {
        $job = Uuid::isValid($jobId) ? $this->jobs->find(Uuid::fromString($jobId)) : null;
        if ($job === null) {
            return new JsonResponse(['detail' => 'Import job not found.'], 404);
        }

        if ($job->getStatus() !== UserBulkImportJobStatus::VALIDATED) {
            return new JsonResponse([
                'detail' => sprintf('Job is not in the VALIDATED state. Current status: %s.', $job->getStatus()->value),
            ], 409);
        }

        $job->setStatus(UserBulkImportJobStatus::COMMITTING);
        $this->em->flush();

        $this->bus->dispatch(new CommitUserBulkImportMessage((string) $job->getId()));

        return new JsonResponse($this->responseBuilder->build($job), 202);
    }
}
