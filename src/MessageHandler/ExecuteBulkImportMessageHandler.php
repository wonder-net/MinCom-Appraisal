<?php

declare(strict_types=1);

namespace App\MessageHandler;

use App\BulkImport\BulkImportCreator;
use App\BulkImport\BulkImportFileStorage;
use App\BulkImport\BulkImportParser;
use App\BulkImport\BulkImportValidator;
use App\Entity\BulkImportJob;
use App\Enum\BulkImportJobStatus;
use App\Message\ExecuteBulkImportMessage;
use App\Repository\BulkImportJobRepository;
use App\Service\NotificationService;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.accounts.tasks.execute_bulk_import (legacy synchronous path).
 */
#[AsMessageHandler]
final class ExecuteBulkImportMessageHandler
{
    public function __construct(
        private readonly BulkImportJobRepository $jobs,
        private readonly BulkImportFileStorage $storage,
        private readonly BulkImportParser $parser,
        private readonly BulkImportCreator $creator,
        private readonly BulkImportValidator $validator,
        private readonly NotificationService $notifications,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function __invoke(ExecuteBulkImportMessage $message): void
    {
        $job = $this->jobs->find(Uuid::fromString($message->jobId));
        if ($job === null) {
            $this->logger->error('Bulk import job {id} not found.', ['id' => $message->jobId]);

            return;
        }

        $job->setStatus(BulkImportJobStatus::PROCESSING);
        $this->em->flush();

        try {
            $fileBytes = $this->storage->read($job->getFilePath());
            $parsed = $this->parser->parseFile($fileBytes, $job->getFilePath());
            $result = $this->creator->execute($parsed->rows, BulkImportValidator::MAX_ROWS);

            $job->setStatus(BulkImportJobStatus::COMPLETED);
            $job->setCreatedCount($result->createdCount);
            $job->setFailedCount($result->failedCount);
            $job->setTotalRows($result->totalRows);
            $job->setFailedRows($result->failedRows);
            $job->setCompletedAt(new \DateTimeImmutable());
            $this->em->flush();

            $completionMessage = sprintf('Bulk import complete: %d created', $result->createdCount);
            if ($result->failedCount > 0) {
                $completionMessage .= sprintf(', %d failed', $result->failedCount);
            }
            $this->notifyCompletion($job, $completionMessage.'.');
        } catch (\Throwable $exc) {
            $this->logger->error('Bulk import job {id} failed: {message}', [
                'id' => $message->jobId,
                'message' => $exc->getMessage(),
            ]);
            $job->setStatus(BulkImportJobStatus::FAILED);
            $job->setCompletedAt(new \DateTimeImmutable());
            $this->em->flush();

            $this->notifyCompletion($job, 'Bulk import failed. Please try again or contact support.');
        } finally {
            $this->storage->delete($job->getFilePath());
        }
    }

    private function notifyCompletion(BulkImportJob $job, string $message): void
    {
        $this->notifications->create(
            $job->getCreatedBy(),
            null,
            'bulk_import.complete',
            $message,
            relatedObjectType: 'BulkImportJob',
            relatedObjectId: $job->getId(),
        );
    }
}
