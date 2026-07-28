<?php

declare(strict_types=1);

namespace App\Controller\Admin\BulkImport;

use App\BulkImport\BulkImportFileStorage;
use App\BulkImport\BulkImportParseException;
use App\BulkImport\BulkImportParser;
use App\BulkImport\BulkImportValidator;
use App\BulkImport\UploadedSpreadsheetValidator;
use App\Entity\BulkImportJob;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of apps.accounts.views.AdminBulkImportValidateView (legacy
 * synchronous path, Step 1). Preserves Django's `{"detail": ...}` error
 * shape for this endpoint specifically — see AuthErrorResponses' docblock
 * for the broader pattern of faithfully reproducing Django's per-endpoint
 * inconsistencies rather than normalizing them away.
 */
#[IsGranted('IS_ADMIN')]
final class AdminBulkImportValidateController
{
    private const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

    public function __construct(
        private readonly UploadedSpreadsheetValidator $uploadValidator,
        private readonly BulkImportParser $parser,
        private readonly BulkImportValidator $validator,
        private readonly BulkImportFileStorage $storage,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/v1/admin/users/bulk-import/validate/', name: 'admin_bulk_import_validate', methods: ['POST'])]
    public function __invoke(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $file = $request->files->get('file');
        $uploadError = $this->uploadValidator->validate($file, self::MAX_UPLOAD_BYTES);
        if ($uploadError !== null) {
            return new JsonResponse(['detail' => ['file' => [$uploadError]]], 400);
        }

        $fileBytes = file_get_contents($file->getPathname());

        try {
            $parsed = $this->parser->parseFile($fileBytes, $file->getClientOriginalName());
        } catch (BulkImportParseException $exc) {
            return new JsonResponse(['detail' => $exc->getUserMessage(), 'code' => $exc->getErrorCode()], 422);
        }

        $preview = $this->validator->validate($parsed->rows);

        if ($preview->validRows === []) {
            return new JsonResponse([
                'import_id' => null,
                ...$preview->toArray(),
                'valid_count' => 0,
                'error_count' => count($preview->errorRows),
            ]);
        }

        $job = new BulkImportJob($user);
        $job->setTotalRows($preview->total);
        $this->em->persist($job);
        $this->em->flush();

        $extension = str_ends_with(strtolower($file->getClientOriginalName()), '.csv') ? '.csv' : '.xlsx';
        $path = $this->storage->store($fileBytes, (string) $job->getId(), $extension);
        $job->setFilePath($path);
        $this->em->flush();

        return new JsonResponse([
            'import_id' => (string) $job->getId(),
            ...$preview->toArray(),
            'valid_count' => count($preview->validRows),
            'error_count' => count($preview->errorRows),
        ]);
    }
}
