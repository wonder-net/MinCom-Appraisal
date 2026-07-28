<?php

declare(strict_types=1);

namespace App\MessageHandler;

use App\BulkImport\BulkImportCreator;
use App\BulkImport\BulkImportFileStorage;
use App\BulkImport\BulkImportParser;
use App\BulkImport\BulkImportValidator;
use App\Entity\UserBulkImportJob;
use App\Enum\UserBulkImportJobStatus;
use App\Message\CommitUserBulkImportMessage;
use App\Repository\EmployeeRepository;
use App\Repository\UserBulkImportJobRepository;
use App\Service\EmailService;
use App\Service\NotificationService;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.accounts.tasks.commit_user_bulk_import (TASK-304).
 * Idempotent: a no-op unless the job is COMMITTING.
 *
 * The branded completion email is rendered/sent directly here (bypassing
 * the generic notification-email pipeline, same as Django's
 * _notify_completion), since it needs job-level counts/URL the generic
 * Notification/Appraisal relations don't carry. Sent on both the crash
 * and success paths, matching Django (unlike the sibling appraisal
 * bulk-import handler, whose except-branch skips the email).
 */
#[AsMessageHandler]
final class CommitUserBulkImportMessageHandler
{
    private const PROGRESS_CHUNK = 100;

    public function __construct(
        private readonly UserBulkImportJobRepository $jobs,
        private readonly BulkImportFileStorage $storage,
        private readonly BulkImportParser $parser,
        private readonly BulkImportCreator $creator,
        private readonly NotificationService $notifications,
        private readonly EmployeeRepository $employees,
        private readonly EmailService $emailService,
        private readonly string $frontendUrl,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function __invoke(CommitUserBulkImportMessage $message): void
    {
        $job = $this->jobs->find(Uuid::fromString($message->jobId));
        if ($job === null) {
            $this->logger->error('User bulk import job {id} not found.', ['id' => $message->jobId]);

            return;
        }

        if ($job->getStatus() !== UserBulkImportJobStatus::COMMITTING) {
            $this->logger->info('User bulk import job {id} skipped commit (status={status}).', [
                'id' => $message->jobId,
                'status' => $job->getStatus()->value,
            ]);

            return;
        }

        $job->setCommitStartedAt(new \DateTimeImmutable());
        $job->setProcessedRows(0);
        $this->em->flush();

        $totalRows = $job->getTotalRows();
        $onProgress = function (int $count) use ($job, $totalRows): void {
            if ($count % self::PROGRESS_CHUNK === 0 || $count === $totalRows) {
                $job->setProcessedRows($count);
                $this->em->flush();
            }
        };

        try {
            $fileBytes = $this->storage->read($job->getStoredFilePath());
            $parsed = $this->parser->parseFile($fileBytes, $job->getOriginalFilename());
            $result = $this->creator->execute($parsed->rows, BulkImportValidator::ASYNC_MAX_ROWS, $onProgress);
        } catch (\Throwable $exc) {
            $this->logger->error('User bulk import job {id} commit crashed: {message}', [
                'id' => $message->jobId,
                'message' => $exc->getMessage(),
            ]);
            $job->setStatus(UserBulkImportJobStatus::FAILED);
            $job->setErrorMessage('Commit failed unexpectedly. Please contact support.');
            $job->setCommitCompletedAt(new \DateTimeImmutable());
            $this->em->flush();
            $this->notifyCompletion($job);
            $this->storage->delete($job->getStoredFilePath());

            return;
        }

        $job->setStatus(match (true) {
            $result->createdCount === 0 && $result->failedCount > 0 => UserBulkImportJobStatus::FAILED,
            $result->failedCount > 0 => UserBulkImportJobStatus::PARTIAL_SUCCESS,
            default => UserBulkImportJobStatus::SUCCEEDED,
        });
        $job->setCreatedCount($result->createdCount);
        $job->setFailedCount($result->failedCount);
        $job->setFailedRows($result->failedRows);
        $job->setProcessedRows($result->totalRows);
        $job->setCommitCompletedAt(new \DateTimeImmutable());
        $this->em->flush();

        $this->notifyCompletion($job);
        $this->storage->delete($job->getStoredFilePath());
    }

    /**
     * Port of _notify_completion: send_email=false on the in-app
     * notification (the branded email, with job-level context the
     * generic pipeline doesn't surface, is sent directly below instead).
     */
    private function notifyCompletion(UserBulkImportJob $job): void
    {
        $this->notifications->create(
            $job->getCreatedBy(),
            null,
            'user_bulk_import.completed',
            sprintf(
                'Your bulk import of %d users completed. %d created, %d failed.',
                $job->getTotalRows(),
                $job->getCreatedCount(),
                $job->getFailedCount(),
            ),
            sendEmail: false,
            relatedObjectType: 'UserBulkImportJob',
            relatedObjectId: $job->getId(),
            metadata: ['job_id' => (string) $job->getId(), 'status' => $job->getStatus()->value],
        );

        $recipient = $job->getCreatedBy();
        $recipientEmail = $recipient->getEmail();
        if ($recipientEmail === '') {
            return;
        }

        $recipientName = $this->employees->findByUser($recipient)?->getName() ?: 'HR Admin';
        $resultsUrl = sprintf('%s/admin/users/bulk-import/jobs/%s', rtrim($this->frontendUrl, '/'), $job->getId());

        $this->emailService->sendUserBulkImportCompleted(
            $recipientEmail,
            $recipientName,
            $job->getTotalRows(),
            $job->getCreatedCount(),
            $job->getFailedCount(),
            $job->getStatus()->label(),
            $resultsUrl,
        );
    }
}
