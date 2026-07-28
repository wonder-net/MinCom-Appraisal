<?php

declare(strict_types=1);

namespace App\Controller\Appraisals;

use App\AppraisalImport\AppraisalImportExcelService;
use App\Entity\User;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of AppraisalViewSet.import_excel (TASK-064) — imports a single
 * .xls file into ONE existing appraisal (SELF_ASSESSMENT only). Not to
 * be confused with the HR-wide multi-file bulk import endpoints under
 * /appraisals/bulk-import/ (AppraisalBulkImport{Validate,Confirm,Results}
 * Controller), a separate, newer feature that coexists with this one.
 */
#[IsGranted('IS_ADMIN')]
final class AppraisalImportExcelController
{
    public function __construct(private readonly AppraisalImportExcelService $service)
    {
    }

    #[Route('/api/v1/appraisals/{id}/import-excel/', name: 'appraisals_import_excel', methods: ['POST'], requirements: ['id' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $id, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $file = $request->files->get('file');
        if ($file === null) {
            return new JsonResponse(['file' => ['This field is required.']], 400);
        }

        if (!str_ends_with(strtolower($file->getClientOriginalName()), '.xls')) {
            return new JsonResponse(['file' => ['Only .xls files are accepted.']], 400);
        }

        // A real upload exceeding php.ini's upload_max_filesize arrives
        // with an empty path and this specific error code — getSize()
        // isn't reliable at that point, so check it first.
        if ($file->getError() === \UPLOAD_ERR_INI_SIZE || $file->getSize() > AppraisalImportExcelService::MAX_FILE_SIZE) {
            return new JsonResponse(['code' => 'FILE_TOO_LARGE', 'message' => 'File exceeds the 5 MB size limit.'], 413);
        }

        $fileBytes = file_get_contents($file->getPathname());
        if (strlen($fileBytes) > AppraisalImportExcelService::MAX_FILE_SIZE) {
            return new JsonResponse(['code' => 'FILE_TOO_LARGE', 'message' => 'File exceeds the 5 MB size limit.'], 413);
        }

        $outcome = $this->service->import($id, $user, $fileBytes, $file->getClientOriginalName());

        return match ($outcome->kind) {
            'not_found' => throw new NotFoundHttpException(),
            'status_not_allowed' => new JsonResponse(['code' => 'IMPORT_NOT_ALLOWED', 'message' => 'Import is not allowed for this appraisal.'], 400),
            'parse_error' => new JsonResponse(['code' => $outcome->parseErrorCode, 'message' => 'The uploaded file could not be processed.'], 422),
            default => new JsonResponse(['import_summary' => [
                'kd_count' => $outcome->summary->kdCount,
                'competency_count' => $outcome->summary->competencyCount,
                'comments_imported' => $outcome->summary->commentsImported,
                'warnings' => $outcome->summary->warnings,
                'growth_plan_imported' => $outcome->summary->growthPlanImported,
                'strengths_count' => $outcome->summary->strengthsCount,
                'weaknesses_count' => $outcome->summary->weaknessesCount,
                'training_needs_count' => $outcome->summary->trainingNeedsCount,
            ]]),
        };
    }
}
