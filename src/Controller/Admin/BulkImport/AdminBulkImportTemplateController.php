<?php

declare(strict_types=1);

namespace App\Controller\Admin\BulkImport;

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx as XlsxWriter;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of apps.accounts.views.AdminBulkImportTemplateView: a blank .xlsx
 * template download. Bypasses the JSON envelope entirely (binary
 * attachment), same as Django's raw HttpResponse.
 */
#[IsGranted('IS_ADMIN')]
final class AdminBulkImportTemplateController
{
    private const HEADERS = [
        'employee_number', 'full_name', 'email', 'job_title', 'department',
        'job_family', 'location', 'appraisor_employee_number', 'roles',
    ];

    private const EXAMPLE_ROW = [
        'EMP-001', 'Jane Doe', 'jane.doe@example.com', 'Software Engineer',
        'Information Technology', 'Engineering', 'Accra', '', 'APPRAISEE',
    ];

    #[Route('/api/v1/admin/users/bulk-import/template/', name: 'admin_bulk_import_template_xlsx', methods: ['GET'])]
    public function __invoke(): Response
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Employees');
        $sheet->fromArray(self::HEADERS, null, 'A1');
        $sheet->fromArray(self::EXAMPLE_ROW, null, 'A2');

        $tempPath = tempnam(sys_get_temp_dir(), 'bulk-import-template-');
        (new XlsxWriter($spreadsheet))->save($tempPath);
        $bytes = file_get_contents($tempPath);
        unlink($tempPath);

        $response = new Response($bytes, 200, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => 'attachment; filename="bulk_import_template.xlsx"',
        ]);

        return $response;
    }
}
