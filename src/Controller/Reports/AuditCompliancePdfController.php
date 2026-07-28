<?php

declare(strict_types=1);

namespace App\Controller\Reports;

use App\Entity\User;
use App\Service\AuditCompliancePdfContextBuilder;
use App\Service\AuditService;
use App\Service\PdfRenderer;
use App\Service\ReportCycleResolver;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of AuditCompliancePDFView. Uncached — a low-frequency compliance
 * document (no cache.get/set in Django). Unlike every other 13d/13e
 * report, an unresolved cycle here is a 400 ("No active cycle found."),
 * not a 404 or an empty payload — matched exactly.
 */
#[IsGranted('IS_HR_STAFF')]
final class AuditCompliancePdfController
{
    public function __construct(
        private readonly ReportCycleResolver $cycleResolver,
        private readonly AuditCompliancePdfContextBuilder $contextBuilder,
        private readonly PdfRenderer $renderer,
        private readonly AuditService $auditService,
    ) {
    }

    #[Route('/api/v1/reports/audit-compliance/pdf/', name: 'reports_audit_compliance_pdf', methods: ['GET'])]
    public function __invoke(Request $request, #[CurrentUser] User $user): Response
    {
        $correlationId = (string) $request->attributes->get('correlation_id');

        [$cycle, $err] = $this->cycleResolver->resolve($request);
        if ($err !== null) {
            return $err;
        }

        if ($cycle === null) {
            return new JsonResponse(['detail' => 'No active cycle found.'], 400);
        }

        $context = $this->contextBuilder->build($cycle, $user);

        try {
            $pdfBytes = $this->renderer->render('pdf/audit_compliance_report.html.twig', $context);
        } catch (\Throwable $exc) {
            \Sentry\withScope(static function (\Sentry\State\Scope $scope) use ($correlationId, $exc): void {
                $scope->setTag('correlation_id', $correlationId);
                \Sentry\captureException($exc);
            });

            return new JsonResponse(['status' => 'error', 'message' => 'PDF generation failed. Please try again.', 'correlation_id' => $correlationId], 500);
        }

        // Audit entry written only after successful generation, matching Django's step 8 (after step 7's WeasyPrint/dompdf render succeeds).
        $this->auditService->log(
            'report.compliance.pdf',
            'AppraisalCycle',
            $cycle->getId(),
            $user,
            null,
            null,
            $request->getClientIp(),
            ['cycle_name' => $cycle->getPeriodName(), 'appraisal_count' => $context['summary']['total_count'], 'generated_by' => (string) $user->getId()],
        );

        $filename = sprintf('audit-compliance-%s.pdf', $cycle->getStartDate()->format('Y'));

        $response = new Response($pdfBytes, 200, ['Content-Type' => 'application/pdf']);
        $response->headers->set('Content-Disposition', sprintf('attachment; filename="%s"', $filename));

        return $response;
    }
}
