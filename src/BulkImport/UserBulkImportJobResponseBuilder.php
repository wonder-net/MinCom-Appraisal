<?php

declare(strict_types=1);

namespace App\BulkImport;

use App\Entity\UserBulkImportJob;
use App\Repository\EmployeeRepository;

/**
 * Port of apps.accounts.views._serialize_user_bulk_import_job. The
 * created_by.full_name quirk (derived solely from
 * creator.employee_profile.name, never falling back to User.full_name
 * — unlike everywhere else in Django's port) is reproduced deliberately:
 * it's "" whenever the creator has no linked Employee profile.
 */
final class UserBulkImportJobResponseBuilder
{
    public function __construct(private readonly EmployeeRepository $employees)
    {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(UserBulkImportJob $job): array
    {
        $creator = $job->getCreatedBy();
        $creatorProfile = $this->employees->findByUser($creator);

        return [
            'id' => (string) $job->getId(),
            'status' => $job->getStatus()->value,
            'original_filename' => $job->getOriginalFilename(),
            'total_rows' => $job->getTotalRows(),
            'processed_rows' => $job->getProcessedRows(),
            'created_count' => $job->getCreatedCount(),
            'failed_count' => $job->getFailedCount(),
            'validation_preview' => $job->getValidationPreview(),
            'failed_rows' => $job->getFailedRows() ?? [],
            'error_message' => $job->getErrorMessage() !== '' ? $job->getErrorMessage() : null,
            'created_at' => $job->getCreatedAt()->format(\DateTimeInterface::ATOM),
            'updated_at' => $job->getUpdatedAt()->format(\DateTimeInterface::ATOM),
            'validation_completed_at' => $job->getValidationCompletedAt()?->format(\DateTimeInterface::ATOM),
            'commit_started_at' => $job->getCommitStartedAt()?->format(\DateTimeInterface::ATOM),
            'commit_completed_at' => $job->getCommitCompletedAt()?->format(\DateTimeInterface::ATOM),
            'created_by' => [
                'id' => (string) $creator->getId(),
                'email' => $creator->getEmail(),
                'full_name' => $creatorProfile?->getName() ?? '',
            ],
        ];
    }
}
