<?php

declare(strict_types=1);

namespace App\Controller\Appraisals\BulkImport;

use App\Entity\User;
use App\Enum\AppraisalBulkImportJobStatus;
use App\Message\ExecuteAppraisalBulkImportMessage;
use App\Repository\AppraisalBulkImportJobRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Port of AppraisalBulkImportConfirmView (Step 2): validates
 * confirmed_matches, flips the job to PROCESSING, and dispatches the
 * async executor message — mirrors Django's Celery `.delay()` call via
 * Symfony Messenger (see Milestone 8's user bulk import for the same
 * Celery -> Messenger substitution).
 */
#[IsGranted('IS_ADMIN')]
final class AppraisalBulkImportConfirmController
{
    public function __construct(
        private readonly AppraisalBulkImportJobRepository $jobs,
        private readonly EntityManagerInterface $em,
        private readonly MessageBusInterface $bus,
    ) {
    }

    #[Route('/api/v1/appraisals/bulk-import/{importId}/confirm/', name: 'appraisal_bulk_import_confirm', methods: ['POST'])]
    public function __invoke(string $importId, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $job = Uuid::isValid($importId) ? $this->jobs->find(Uuid::fromString($importId)) : null;
        if ($job === null || !$job->getCreatedBy()->getId()->equals($user->getId())) {
            return new JsonResponse(['detail' => 'Import job not found.'], 404);
        }

        if ($job->getStatus() !== AppraisalBulkImportJobStatus::PENDING) {
            return new JsonResponse(['detail' => sprintf('Import job is already %s.', strtolower($job->getStatus()->value))], 400);
        }

        $payload = json_decode($request->getContent(), true) ?? [];
        $confirmedMatches = $payload['confirmed_matches'] ?? null;

        if (!is_array($confirmedMatches) || $confirmedMatches === [] || array_is_list($confirmedMatches)) {
            return new JsonResponse(['detail' => ['confirmed_matches' => ['At least one confirmed match is required.']]], 400);
        }

        foreach ($confirmedMatches as $filename => $employeeId) {
            if (!is_string($employeeId) || !Uuid::isValid($employeeId)) {
                return new JsonResponse(['detail' => ['confirmed_matches' => [sprintf("Invalid employee ID for '%s': must be a valid UUID.", $filename)]]], 400);
            }
        }

        $job->setPreviewData(['confirmed_matches' => $confirmedMatches]);
        $job->setStatus(AppraisalBulkImportJobStatus::PROCESSING);
        $this->em->flush();

        $this->bus->dispatch(new ExecuteAppraisalBulkImportMessage((string) $job->getId()));

        return new JsonResponse(['import_id' => (string) $job->getId(), 'status' => 'queued'], 202);
    }
}
