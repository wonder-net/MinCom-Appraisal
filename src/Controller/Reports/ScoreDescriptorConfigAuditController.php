<?php

declare(strict_types=1);

namespace App\Controller\Reports;

use App\Repository\AppraisalCycleRepository;
use App\Service\ScoreDescriptorConfigAuditBuilder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Port of ScoreDescriptorConfigAuditView. Unlike every other reports
 * endpoint, `cycle_id` is REQUIRED here (400 if missing) with no
 * fallback to the active cycle, and the cycle may be in any status
 * (this is a historical audit tool, not scoped to live data).
 */
#[IsGranted('IS_HR_STAFF')]
final class ScoreDescriptorConfigAuditController
{
    public function __construct(
        private readonly AppraisalCycleRepository $cycles,
        private readonly ScoreDescriptorConfigAuditBuilder $builder,
    ) {
    }

    #[Route('/api/v1/reports/descriptor-config/', name: 'reports_descriptor_config', methods: ['GET'])]
    public function __invoke(Request $request): JsonResponse
    {
        $rawCycleId = $request->query->get('cycle_id');
        if ($rawCycleId === null) {
            return new JsonResponse(['detail' => 'cycle_id is required.'], 400);
        }
        if (!is_string($rawCycleId) || !Uuid::isValid($rawCycleId)) {
            return new JsonResponse(['detail' => 'Invalid cycle_id.'], 400);
        }

        $cycle = $this->cycles->find(Uuid::fromString($rawCycleId));
        if ($cycle === null) {
            throw new NotFoundHttpException();
        }

        return new JsonResponse($this->builder->build($cycle));
    }
}
