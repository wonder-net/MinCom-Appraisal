<?php

declare(strict_types=1);

namespace App\Controller\Admin\BulkImport;

use App\Entity\User;
use App\Enum\BulkImportJobStatus;
use App\Message\ExecuteBulkImportMessage;
use App\Repository\BulkImportJobRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.accounts.views.AdminBulkImportConfirmView (legacy path, Step 2).
 */
#[IsGranted('IS_ADMIN')]
final class AdminBulkImportConfirmController
{
    public function __construct(
        private readonly BulkImportJobRepository $jobs,
        private readonly EntityManagerInterface $em,
        private readonly MessageBusInterface $bus,
    ) {
    }

    #[Route('/api/v1/admin/users/bulk-import/{importId}/confirm/', name: 'admin_bulk_import_confirm', methods: ['POST'])]
    public function __invoke(string $importId, #[CurrentUser] User $user): JsonResponse
    {
        $job = Uuid::isValid($importId) ? $this->jobs->find(Uuid::fromString($importId)) : null;
        if ($job === null || $job->getCreatedBy()->getId()->toRfc4122() !== (string) $user->getId()) {
            return new JsonResponse(['detail' => 'Import job not found.'], 404);
        }

        if ($job->getStatus() !== BulkImportJobStatus::PENDING) {
            return new JsonResponse(['detail' => sprintf('Import job is already %s.', strtolower($job->getStatus()->value))], 400);
        }

        $job->setStatus(BulkImportJobStatus::PROCESSING);
        $this->em->flush();

        $this->bus->dispatch(new ExecuteBulkImportMessage((string) $job->getId()));

        return new JsonResponse(['import_id' => (string) $job->getId(), 'status' => 'processing'], 202);
    }
}
