<?php

declare(strict_types=1);

namespace App\Controller\Admin\BulkImport;

use App\BulkImport\BulkImportFileStorage;
use App\BulkImport\UploadedSpreadsheetValidator;
use App\BulkImport\UserBulkImportJobResponseBuilder;
use App\Entity\User;
use App\Entity\UserBulkImportJob;
use App\Message\ValidateUserBulkImportMessage;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of apps.accounts.views.UserBulkImportJobCreateListView.post()
 * (TASK-304): create the async job, persist the upload, enqueue
 * validation.
 */
#[IsGranted('IS_ADMIN')]
final class UserBulkImportJobCreateController
{
    private const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

    public function __construct(
        private readonly UploadedSpreadsheetValidator $uploadValidator,
        private readonly BulkImportFileStorage $storage,
        private readonly UserBulkImportJobResponseBuilder $responseBuilder,
        private readonly EntityManagerInterface $em,
        private readonly MessageBusInterface $bus,
    ) {
    }

    #[Route('/api/v1/admin/users/bulk-import/jobs/', name: 'admin_user_bulk_import_jobs_create', methods: ['POST'])]
    public function __invoke(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $file = $request->files->get('file');
        $uploadError = $this->uploadValidator->validate($file, self::MAX_UPLOAD_BYTES);
        if ($uploadError !== null) {
            return new JsonResponse(['detail' => ['file' => [$uploadError]]], 400);
        }

        $originalFilename = $file->getClientOriginalName();
        $extension = str_ends_with(strtolower($originalFilename), '.csv') ? '.csv' : '.xlsx';

        $job = new UserBulkImportJob($user, $originalFilename, '');
        $this->em->persist($job);
        $this->em->flush();

        $fileBytes = file_get_contents($file->getPathname());
        $path = $this->storage->store($fileBytes, (string) $job->getId(), $extension);
        $job->setStoredFilePath($path);
        $this->em->flush();

        $this->bus->dispatch(new ValidateUserBulkImportMessage((string) $job->getId()));

        return new JsonResponse($this->responseBuilder->build($job), 202);
    }
}
