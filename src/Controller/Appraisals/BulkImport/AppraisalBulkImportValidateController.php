<?php

declare(strict_types=1);

namespace App\Controller\Appraisals\BulkImport;

use App\AppraisalImport\AppraisalBulkImportPreviewService;
use App\AppraisalImport\FilePreview;
use App\AppraisalImport\ZipExtractionException;
use App\AppraisalImport\ZipExtractor;
use App\BulkImport\BulkImportFileStorage;
use App\Entity\AppraisalBulkImportJob;
use App\Entity\User;
use App\Enum\AppraisalCycleStatus;
use App\Repository\AppraisalCycleRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Port of AppraisalBulkImportValidateView (Step 1 of the HR-wide
 * multi-file bulk import). Uses raw JsonResponse error bodies (not
 * ValidationErrorFactory) throughout, matching Django's hand-rolled
 * Response({...}, status=400) calls here.
 */
#[IsGranted('IS_ADMIN')]
final class AppraisalBulkImportValidateController
{
    private const MAX_XLS_SIZE = 5 * 1024 * 1024;
    private const MAX_ZIP_SIZE = 50 * 1024 * 1024;
    private const ALLOWED_TARGET_STATUSES = ['DISCUSSION', 'GROWTH_PLANNING', 'PENDING_SIGNOFF', 'SIGNED_OFF', 'FINALISED'];

    public function __construct(
        private readonly AppraisalCycleRepository $cycles,
        private readonly AppraisalBulkImportPreviewService $previewService,
        private readonly ZipExtractor $zipExtractor,
        private readonly BulkImportFileStorage $storage,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/v1/appraisals/bulk-import/validate/', name: 'appraisal_bulk_import_validate', methods: ['POST'])]
    public function __invoke(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $file = $request->files->get('file');
        $cycleId = $request->request->get('cycle_id');
        $targetStatus = $request->request->get('target_status');

        $errors = $this->validateInput($file, $cycleId, $targetStatus);
        if ($errors !== []) {
            return new JsonResponse(['detail' => $errors], 400);
        }

        $cycle = $this->cycles->find(Uuid::fromString($cycleId));
        if ($cycle === null || $cycle->getStatus() !== AppraisalCycleStatus::ACTIVE) {
            return new JsonResponse(['detail' => 'No active cycle found with the given ID. Please create or activate a cycle first.'], 400);
        }

        $fileBytes = file_get_contents($file->getPathname());
        $originalName = $file->getClientOriginalName();

        try {
            $files = str_ends_with(strtolower($originalName), '.zip')
                ? $this->zipExtractor->extract($fileBytes)
                : [[$originalName, $fileBytes]];
        } catch (ZipExtractionException $exc) {
            return new JsonResponse(['detail' => $exc->getMessage(), 'code' => $exc->errorCode], 422);
        }

        $preview = $this->previewService->preview($files, $targetStatus);

        $job = new AppraisalBulkImportJob($user, $cycle, $targetStatus);
        $job->setTotalFiles($preview->totalFiles);
        $this->em->persist($job);
        $this->em->flush();

        $path = $this->storage->storePreservingName($fileBytes, (string) $job->getId(), $originalName);
        $job->setFilePath($path);
        $this->em->flush();

        return new JsonResponse([
            'import_id' => (string) $job->getId(),
            'target_status' => $targetStatus,
            'files' => array_map($this->buildFilePreview(...), $preview->files),
            'summary' => [
                'total_files' => $preview->totalFiles,
                'matched' => $preview->matched,
                'suggested' => $preview->suggested,
                'unmatched' => $preview->unmatched,
                'errors' => $preview->errors,
                'score_discrepancies' => $preview->scoreDiscrepancies,
            ],
        ]);
    }

    /**
     * @return array<string, list<string>>
     */
    private function validateInput(mixed $file, mixed $cycleId, mixed $targetStatus): array
    {
        $errors = [];

        if ($file === null) {
            $errors['file'] = ['This field is required.'];
        } else {
            $name = strtolower($file->getClientOriginalName());
            $isZip = str_ends_with($name, '.zip');
            $isXls = str_ends_with($name, '.xls') || str_ends_with($name, '.xlsx');
            // A real upload exceeding php.ini's upload_max_filesize
            // arrives with an empty path and this specific error code —
            // getSize() isn't reliable at that point, so check it first.
            $exceedsIniLimit = $file->getError() === \UPLOAD_ERR_INI_SIZE;
            if (!$isZip && !$isXls) {
                $errors['file'] = ['Only .xls, .xlsx, and .zip files are supported.'];
            } elseif ($isZip && ($exceedsIniLimit || $file->getSize() > self::MAX_ZIP_SIZE)) {
                $errors['file'] = ['Zip file size exceeds the 50 MB limit.'];
            } elseif ($isXls && ($exceedsIniLimit || $file->getSize() > self::MAX_XLS_SIZE)) {
                $errors['file'] = ['Single file size exceeds the 5 MB limit.'];
            }
        }

        if ($cycleId === null || $cycleId === '') {
            $errors['cycle_id'] = ['This field is required.'];
        } elseif (!is_string($cycleId) || !Uuid::isValid($cycleId)) {
            $errors['cycle_id'] = ['Must be a valid UUID.'];
        }

        if ($targetStatus === null || $targetStatus === '') {
            $errors['target_status'] = ['This field is required.'];
        } elseif (!in_array($targetStatus, self::ALLOWED_TARGET_STATUSES, true)) {
            $errors['target_status'] = [sprintf('"%s" is not a valid choice.', $targetStatus)];
        }

        return $errors;
    }

    /**
     * @return array<string, mixed>
     */
    private function buildFilePreview(FilePreview $fp): array
    {
        $data = [
            'filename' => $fp->filename,
            'form_type' => $fp->formType,
            'extracted' => [
                'employee_name' => $fp->extractedName,
                'department' => $fp->extractedDepartment,
                'job_title' => $fp->extractedJobTitle,
                'location' => $fp->extractedLocation,
                'employee_number' => $fp->extractedEmployeeNumber,
            ],
            'errors' => $fp->errors,
            'data_summary' => $fp->dataSummary,
        ];

        if ($fp->matchResult !== null) {
            $data['match_status'] = $fp->matchResult->matchType;
            $data['match_confidence'] = $fp->matchResult->confidence;
            $data['matched_employee'] = $fp->matchResult->employeeId !== null ? [
                'id' => $fp->matchResult->employeeId,
                'employee_number' => $fp->matchResult->employeeNumber,
                'name' => $fp->matchResult->employeeName,
            ] : null;
            $data['candidates'] = array_map(static fn ($c) => [
                'id' => $c->employeeId,
                'employee_number' => $c->employeeNumber,
                'name' => $c->name,
                'department' => $c->department,
                'score' => $c->score,
            ], $fp->matchResult->candidates);
        }

        if ($fp->scoreValidation !== null) {
            $sv = $fp->scoreValidation;
            $data['score_validation'] = [
                'document_kd_avg' => $sv->documentKdAvg,
                'calculated_kd_avg' => $sv->calculatedKdAvg,
                'document_bc_avg' => $sv->documentBcAvg,
                'calculated_bc_avg' => $sv->calculatedBcAvg,
                'document_total' => $sv->documentTotal,
                'calculated_total' => $sv->calculatedTotal,
                'has_discrepancy' => $sv->hasDiscrepancy,
                'discrepancy_details' => $sv->discrepancyDetails,
            ];
        }

        return $data;
    }
}
