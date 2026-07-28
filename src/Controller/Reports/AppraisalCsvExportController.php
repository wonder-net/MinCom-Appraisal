<?php

declare(strict_types=1);

namespace App\Controller\Reports;

use App\Entity\User;
use App\Repository\AppraisalRepository;
use App\Service\AppraisalCsvExporter;
use App\Service\AuditService;
use App\Service\ReportCycleResolver;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of BulkCSVExportView. HR staff only — no EXECUTIVE, since the
 * export contains decrypted-equivalent PII (employee names). Unlike
 * every other reports endpoint, an unresolved cycle here is a 404
 * ("No active cycle found."), not an empty 200 payload — there is no
 * meaningful empty CSV to stream.
 */
#[IsGranted('IS_HR_STAFF')]
final class AppraisalCsvExportController
{
    public function __construct(
        private readonly ReportCycleResolver $cycleResolver,
        private readonly AppraisalCsvExporter $exporter,
        private readonly AppraisalRepository $appraisals,
        private readonly AuditService $auditService,
    ) {
    }

    #[Route('/api/v1/reports/export/csv/', name: 'reports_export_csv', methods: ['GET'])]
    public function __invoke(Request $request, #[CurrentUser] User $user): Response
    {
        [$cycle, $err] = $this->cycleResolver->resolve($request);
        if ($err !== null) {
            return $err;
        }

        if ($cycle === null) {
            return new JsonResponse(['detail' => 'No active cycle found.'], 404);
        }

        $filename = sprintf('appraisals_%s_%s.csv', $cycle->getId(), (new \DateTimeImmutable())->format('Y-m-d'));

        // Audit log entry written BEFORE streaming starts, matching
        // Django's ordering (it can't be written after — the response
        // has already been sent by then).
        $this->auditService->log(
            'report.csv_export',
            'AppraisalCycle',
            $cycle->getId(),
            $user,
            null,
            null,
            $request->getClientIp(),
            ['cycle_name' => $cycle->getPeriodName(), 'row_count' => $this->appraisals->countFinalisedByCycle($cycle), 'exported_by' => (string) $user->getId()],
        );

        $response = new StreamedResponse(function () use ($cycle): void {
            $stream = fopen('php://output', 'wb');
            $this->exporter->writeTo($stream, $cycle);
            fclose($stream);
        }, 200, ['Content-Type' => 'text/csv']);
        $response->headers->set('Content-Disposition', sprintf('attachment; filename="%s"', $filename));

        return $response;
    }
}
