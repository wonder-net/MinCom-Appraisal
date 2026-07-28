<?php

declare(strict_types=1);

namespace App\Controller\Admin\BulkImport;

use App\Repository\UserBulkImportJobRepository;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.accounts.views.UserBulkImportJobFailedRowsCsvView.
 */
#[IsGranted('IS_ADMIN')]
final class UserBulkImportJobFailedRowsCsvController
{
    private const UNSAFE_PREFIXES = ['=', '+', '-', '@', "\t", "\r"];

    public function __construct(private readonly UserBulkImportJobRepository $jobs)
    {
    }

    #[Route('/api/v1/admin/users/bulk-import/jobs/{jobId}/failed-rows.csv/', name: 'admin_user_bulk_import_jobs_failed_rows_csv', methods: ['GET'])]
    public function __invoke(string $jobId): Response
    {
        $job = Uuid::isValid($jobId) ? $this->jobs->find(Uuid::fromString($jobId)) : null;
        if ($job === null) {
            return new JsonResponse(['detail' => 'Import job not found.'], 404);
        }

        $stream = fopen('php://temp', 'r+');
        fputcsv($stream, ['row_number', 'employee_number', 'email', 'error']);
        foreach ($job->getFailedRows() ?? [] as $row) {
            fputcsv($stream, [
                $this->csvSafe($row['row_number'] ?? ''),
                $this->csvSafe($row['employee_number'] ?? ''),
                $this->csvSafe($row['email'] ?? ''),
                $this->csvSafe($row['error'] ?? ''),
            ]);
        }
        rewind($stream);
        $csv = stream_get_contents($stream);
        fclose($stream);

        return new Response($csv, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => sprintf('attachment; filename="user-bulk-import-%s-failed-rows.csv"', $job->getId()),
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /**
     * Defence-in-depth against CSV/Excel formula injection (CWE-1236): the
     * parser already strips formula triggers on ingest, but this download
     * is re-emitted to a spreadsheet, so sanitise every outbound cell too.
     */
    private function csvSafe(mixed $value): string
    {
        if ($value === null || $value === '') {
            return '';
        }

        $s = (string) $value;
        while ($s !== '' && in_array($s[0], self::UNSAFE_PREFIXES, true)) {
            $s = ltrim(substr($s, 1));
        }

        return $s;
    }
}
