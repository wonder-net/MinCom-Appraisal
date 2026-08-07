<?php

declare(strict_types=1);

namespace App\Controller\Appraisals;

use App\Entity\Appraisal;
use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Enum\RoleName;
use App\Repository\AppraisalRepository;
use App\Repository\EmployeeRepository;
use App\Service\AppraisalPdfContextBuilder;
use App\Service\PdfRenderer;
use App\Service\ReportsCacheService;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of AppraisalPDFView. Any authenticated user may call this
 * (permission check is entirely object-level, done here): appraisee,
 * their manager, admin tier, or EXECUTIVE. A deliberately narrower
 * check than AppraisalRepository::canUserRead() — no escalated-executive
 * or retained-original-manager branches, matching Django's own simpler
 * `_check_access` for this endpoint exactly. Cached as raw PDF bytes
 * under `pdf.appraisal.{id}` for 3600s (busted by WorkflowService,
 * AppraisalEscalateController, AppraisalReassignExecutiveController —
 * see ReportsCacheService::invalidateAppraisalPdf(), wired since 13a).
 */
final class AppraisalPdfController
{
    private const ALLOWED_STATUSES = [AppraisalStatus::SIGNED_OFF, AppraisalStatus::FINALISED];
    private const CACHE_TTL_SECONDS = 3600;

    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly EmployeeRepository $employees,
        private readonly AppraisalPdfContextBuilder $contextBuilder,
        private readonly PdfRenderer $renderer,
        private readonly ReportsCacheService $cache,
    ) {
    }

    #[Route('/api/v1/appraisals/{id}/pdf/', name: 'appraisals_pdf', methods: ['GET'], requirements: ['id' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $id, Request $request, #[CurrentUser] User $user): Response
    {
        $correlationId = (string) $request->attributes->get('correlation_id');

        $appraisal = $this->appraisals->findById($id);
        if ($appraisal === null) {
            throw new NotFoundHttpException();
        }

        if (!$this->checkAccess($user, $appraisal)) {
            return new JsonResponse(['status' => 'error', 'message' => 'Access denied', 'correlation_id' => $correlationId], 403);
        }

        if (!in_array($appraisal->getStatus(), self::ALLOWED_STATUSES, true)) {
            return new JsonResponse([
                'status' => 'error',
                'message' => 'This appraisal has not yet been finalised and cannot be exported as a PDF',
                'correlation_id' => $correlationId,
            ], 403);
        }

        $cacheKey = 'pdf.appraisal.'.$id;

        try {
            $pdfBytes = $this->cache->get(
                $cacheKey,
                [],
                fn () => $this->renderer->render('pdf/appraisal_report.html.twig', $this->contextBuilder->build($appraisal)),
                self::CACHE_TTL_SECONDS,
            );
        } catch (\Throwable $exc) {
            \Sentry\withScope(static function (\Sentry\State\Scope $scope) use ($correlationId, $exc): void {
                $scope->setTag('correlation_id', $correlationId);
                \Sentry\captureException($exc);
            });

            return new JsonResponse(['status' => 'error', 'message' => 'PDF generation failed. Please try again.', 'correlation_id' => $correlationId], 500);
        }

        $filename = sprintf('appraisal-%s-%s.pdf', $appraisal->getEmployee()->getId(), $appraisal->getCycle()->getStartDate()->format('Y'));

        $response = new Response($pdfBytes, 200, ['Content-Type' => 'application/pdf']);
        $response->headers->set('Content-Disposition', sprintf('attachment; filename="%s"', $filename));

        return $response;
    }

    private function checkAccess(User $user, Appraisal $appraisal): bool
    {
        if ($user->hasAdminRole() || $user->hasRole(RoleName::EXECUTIVE)) {
            return true;
        }

        $profile = $this->employees->findByUser($user);
        if ($profile === null) {
            return false;
        }

        $employee = $appraisal->getEmployee();
        if ($employee->getUser()->getId()->equals($user->getId())) {
            return true;
        }

        if ($employee->getManager() !== null && $employee->getManager()->getId()->equals($profile->getId())) {
            return true;
        }

        // HR change request #3: either of the employee's two appraisers
        // (manager or matrix appraiser) can pull the report.
        return $employee->getMatrixAppraiser() !== null && $employee->getMatrixAppraiser()->getId()->equals($profile->getId());
    }
}
