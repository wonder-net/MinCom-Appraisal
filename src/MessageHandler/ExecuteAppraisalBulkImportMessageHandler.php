<?php

declare(strict_types=1);

namespace App\MessageHandler;

use App\AppraisalImport\AppraisalBulkImportExecutor;
use App\AppraisalImport\ExcelParser;
use App\AppraisalImport\ZipExtractor;
use App\BulkImport\BulkImportFileStorage;
use App\Entity\AppraisalBulkImportJob;
use App\Enum\AppraisalBulkImportJobStatus;
use App\Message\ExecuteAppraisalBulkImportMessage;
use App\Repository\AppraisalBulkImportJobRepository;
use App\Repository\EmployeeRepository;
use App\Service\EmailService;
use App\Service\NotificationService;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.appraisals.tasks.execute_appraisal_bulk_import. The
 * branded completion email is rendered/sent directly here (bypassing
 * the generic notification-email pipeline, same as Django), since it
 * needs job-level counts/URL the generic Notification/Appraisal
 * relations don't carry. The in-app Notification row itself
 * (send_email=false in Django too, since the email is sent separately)
 * is created on both the success and failure paths.
 */
#[AsMessageHandler]
final class ExecuteAppraisalBulkImportMessageHandler
{
    public function __construct(
        private readonly AppraisalBulkImportJobRepository $jobs,
        private readonly BulkImportFileStorage $storage,
        private readonly ZipExtractor $zipExtractor,
        private readonly ExcelParser $excelParser,
        private readonly AppraisalBulkImportExecutor $executor,
        private readonly NotificationService $notifications,
        private readonly EmployeeRepository $employees,
        private readonly EmailService $emailService,
        private readonly string $frontendUrl,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function __invoke(ExecuteAppraisalBulkImportMessage $message): void
    {
        $job = $this->jobs->find(Uuid::fromString($message->jobId));
        if ($job === null) {
            $this->logger->error('Appraisal bulk import job {id} not found.', ['id' => $message->jobId]);

            return;
        }

        $job->setStatus(AppraisalBulkImportJobStatus::PROCESSING);
        $this->em->flush();

        try {
            $fileBytes = $this->storage->read($job->getFilePath());

            $files = str_ends_with(strtolower($job->getFilePath()), '.zip')
                ? $this->zipExtractor->extract($fileBytes)
                : [[basename($job->getFilePath()), $fileBytes]];

            $confirmedMatches = $job->getPreviewData()['confirmed_matches'] ?? [];

            $importedCount = 0;
            $failedFiles = [];

            foreach ($files as [$filename, $xlsBytes]) {
                $employeeId = $confirmedMatches[$filename] ?? null;
                if ($employeeId === null) {
                    $failedFiles[] = ['filename' => $filename, 'error' => 'No employee match confirmed for this file.'];
                    continue;
                }

                try {
                    [$parsedSheet, $workbook] = $this->excelParser->parsePerformanceAppraisalSheet($xlsBytes);
                    $parsedGrowthPlan = $this->excelParser->parseGrowthPlansSheet($workbook);

                    $result = $this->executor->executeSingle(
                        $parsedSheet,
                        $parsedGrowthPlan,
                        $employeeId,
                        $job->getTargetStatus(),
                        $job->getCreatedBy(),
                        $job->getCycle() !== null ? (string) $job->getCycle()->getId() : null,
                    );

                    if ($result->error !== null) {
                        $failedFiles[] = ['filename' => $filename, 'error' => $result->error];
                    } else {
                        ++$importedCount;
                    }
                } catch (\Throwable $exc) {
                    $this->logger->error('Failed to import appraisal from file {filename}: {message}', [
                        'filename' => $filename,
                        'message' => $exc->getMessage(),
                    ]);
                    $failedFiles[] = ['filename' => $filename, 'error' => 'Import failed. Contact support.'];
                }
            }

            $job->setStatus($importedCount === 0 && $failedFiles !== []
                ? AppraisalBulkImportJobStatus::FAILED
                : AppraisalBulkImportJobStatus::COMPLETED);
            $job->setImportedCount($importedCount);
            $job->setFailedCount(count($failedFiles));
            $job->setFailedFiles($failedFiles);
            $job->setCompletedAt(new \DateTimeImmutable());
            $this->em->flush();

            $completionMessage = sprintf('Appraisal bulk import complete: %d imported', $importedCount);
            if ($failedFiles !== []) {
                $completionMessage .= sprintf(', %d failed', count($failedFiles));
            }
            $this->notifyCompletion($job, $completionMessage.'.', sendEmail: true);
        } catch (\Throwable $exc) {
            $this->logger->error('Appraisal bulk import job {id} failed: {message}', ['id' => $message->jobId, 'message' => $exc->getMessage()]);
            $job->setStatus(AppraisalBulkImportJobStatus::FAILED);
            $job->setCompletedAt(new \DateTimeImmutable());
            $this->em->flush();

            // No branded email here — matches Django's own except-branch,
            // which only creates the in-app notification.
            $this->notifyCompletion($job, 'Appraisal bulk import failed. Please try again or contact support.', sendEmail: false);
        } finally {
            $this->storage->deleteJobDirectory($job->getFilePath());
        }
    }

    private function notifyCompletion(AppraisalBulkImportJob $job, string $message, bool $sendEmail): void
    {
        $this->notifications->create(
            $job->getCreatedBy(),
            null,
            'appraisal_bulk_import.complete',
            $message,
            sendEmail: false,
            relatedObjectType: 'AppraisalBulkImportJob',
            relatedObjectId: $job->getId(),
        );

        if (!$sendEmail) {
            return;
        }

        $recipient = $job->getCreatedBy();
        $recipientEmail = $recipient->getEmail();
        if ($recipientEmail === '') {
            return;
        }

        $recipientName = $this->employees->findByUser($recipient)?->getName() ?: 'HR Admin';
        $resultsUrl = sprintf('%s/admin/appraisals/import/%s/results', rtrim($this->frontendUrl, '/'), $job->getId());

        $this->emailService->sendAppraisalBulkImportComplete(
            $recipientEmail,
            $recipientName,
            $job->getImportedCount(),
            $job->getFailedCount(),
            $resultsUrl,
        );
    }
}
