<?php

declare(strict_types=1);

namespace App\Controller\Appraisals\BulkImport;

use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Port of TemplateDownloadView. Serves the real MINCOM PA Template
 * .xlsx files (copied from Django's static/templates/ — these are
 * full-featured spreadsheet templates, not something to regenerate
 * programmatically like the trivial header-only Employee bulk-import
 * template).
 */
final class AppraisalTemplateDownloadController
{
    private const TEMPLATES = [
        'form-a' => 'MINCOM_PA_Template_Managerial.xlsx',
        'form-b' => 'MINCOM_PA_Template_Non_Managerial.xlsx',
    ];

    public function __construct(private readonly string $appraisalTemplateDir)
    {
    }

    #[Route('/api/v1/appraisals/templates/{formType}/', name: 'appraisals_template_download', methods: ['GET'])]
    public function __invoke(string $formType): Response
    {
        if (!isset(self::TEMPLATES[$formType])) {
            return new JsonResponse(['detail' => "Invalid form type. Use 'form-a' or 'form-b'."], 400);
        }

        $filename = self::TEMPLATES[$formType];
        $path = $this->appraisalTemplateDir.'/'.$filename;
        if (!is_file($path)) {
            return new JsonResponse(['detail' => 'Template file not found.'], 404);
        }

        return new Response(file_get_contents($path), 200, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => sprintf('attachment; filename="%s"', $filename),
        ]);
    }
}
