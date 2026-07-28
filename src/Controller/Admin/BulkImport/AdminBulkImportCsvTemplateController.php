<?php

declare(strict_types=1);

namespace App\Controller\Admin\BulkImport;

use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of apps.accounts.views.AdminBulkImportCsvTemplateView.
 */
#[IsGranted('IS_ADMIN')]
final class AdminBulkImportCsvTemplateController
{
    private const HEADERS = [
        'employee_number', 'full_name', 'email', 'job_title', 'department',
        'job_family', 'location', 'appraisor_employee_number', 'roles',
    ];

    private const EXAMPLE_ROW = [
        'EMP-001', 'Jane Doe', 'jane.doe@example.com', 'Software Engineer',
        'Information Technology', 'Engineering', 'Accra', '', 'APPRAISEE',
    ];

    #[Route('/api/v1/admin/users/bulk-import/template/csv/', name: 'admin_bulk_import_template_csv', methods: ['GET'])]
    public function __invoke(): Response
    {
        $stream = fopen('php://temp', 'r+');
        fputcsv($stream, self::HEADERS);
        fputcsv($stream, self::EXAMPLE_ROW);
        rewind($stream);
        $csv = stream_get_contents($stream);
        fclose($stream);

        return new Response($csv, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="bulk_import_template.csv"',
        ]);
    }
}
