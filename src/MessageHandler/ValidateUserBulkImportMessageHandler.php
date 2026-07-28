<?php

declare(strict_types=1);

namespace App\MessageHandler;

use App\BulkImport\BulkImportFileStorage;
use App\BulkImport\BulkImportParseException;
use App\BulkImport\BulkImportParser;
use App\BulkImport\BulkImportValidator;
use App\Enum\UserBulkImportJobStatus;
use App\Message\ValidateUserBulkImportMessage;
use App\Repository\UserBulkImportJobRepository;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.accounts.tasks.validate_user_bulk_import (TASK-304).
 * Idempotent: a no-op if the job has already left PENDING_VALIDATION.
 */
#[AsMessageHandler]
final class ValidateUserBulkImportMessageHandler
{
    public function __construct(
        private readonly UserBulkImportJobRepository $jobs,
        private readonly BulkImportFileStorage $storage,
        private readonly BulkImportParser $parser,
        private readonly BulkImportValidator $validator,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function __invoke(ValidateUserBulkImportMessage $message): void
    {
        $job = $this->jobs->find(Uuid::fromString($message->jobId));
        if ($job === null) {
            $this->logger->error('User bulk import job {id} not found.', ['id' => $message->jobId]);

            return;
        }

        if ($job->getStatus() !== UserBulkImportJobStatus::PENDING_VALIDATION) {
            $this->logger->info('User bulk import job {id} skipped validation (status={status}).', [
                'id' => $message->jobId,
                'status' => $job->getStatus()->value,
            ]);

            return;
        }

        try {
            $fileBytes = $this->storage->read($job->getStoredFilePath());
            $parsed = $this->parser->parseFile($fileBytes, $job->getOriginalFilename());
        } catch (BulkImportParseException $exc) {
            $job->setStatus(UserBulkImportJobStatus::VALIDATION_FAILED);
            $job->setErrorMessage($exc->getUserMessage());
            $job->setValidationCompletedAt(new \DateTimeImmutable());
            $this->em->flush();
            $this->storage->delete($job->getStoredFilePath());

            return;
        } catch (\Throwable $exc) {
            $this->logger->error('User bulk import job {id} validation crashed: {message}', [
                'id' => $message->jobId,
                'message' => $exc->getMessage(),
            ]);
            $job->setStatus(UserBulkImportJobStatus::FAILED);
            $job->setErrorMessage('Validation crashed unexpectedly. Please re-upload.');
            $job->setValidationCompletedAt(new \DateTimeImmutable());
            $this->em->flush();
            $this->storage->delete($job->getStoredFilePath());

            return;
        }

        $preview = $this->validator->validate($parsed->rows, BulkImportValidator::ASYNC_MAX_ROWS);

        $job->setTotalRows($preview->total);
        $job->setValidationPreview($preview->toArray());
        $job->setValidationCompletedAt(new \DateTimeImmutable());

        if ($preview->validRows === []) {
            $job->setStatus(UserBulkImportJobStatus::VALIDATION_FAILED);
            if ($job->getErrorMessage() === '') {
                $job->setErrorMessage('No valid rows found. See the validation preview for details.');
            }
        } else {
            $job->setStatus(UserBulkImportJobStatus::VALIDATED);
        }

        $this->em->flush();

        if ($job->getStatus() === UserBulkImportJobStatus::VALIDATION_FAILED) {
            $this->storage->delete($job->getStoredFilePath());
        }
    }
}
