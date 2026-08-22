<?php

declare(strict_types=1);

namespace App\Controller\Appraisals\Cycles;

use App\Enum\AppraisalCycleStatus;
use App\Repository\AppraisalCycleRepository;
use App\Service\AppraisalCycleResponseBuilder;
use App\Service\CycleListCache;
use App\Service\ReportsCacheService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Completes the cycle lifecycle's terminal transition: CLOSED -> ARCHIVED.
 * HR Admin/SYSTEM_ADMIN only. Unlike activate/close, this doesn't touch any
 * Appraisal rows — by the time a cycle is CLOSED every appraisal in it is
 * already in a terminal status (see AppraisalCycleCloseController), so
 * archiving is a pure cycle-level state flip that marks the cycle (and,
 * transitively, its appraisals — see AppraisalCrudController /
 * AppraisalCycleCrudController's deleteEntity() overrides) as part of the
 * permanent record and no longer hand-deletable from the admin panel.
 *
 * Audit logging is intentionally omitted — the `audit` app isn't ported
 * yet (matches the sibling activate/close controllers).
 */
#[IsGranted('IS_ADMIN')]
final class AppraisalCycleArchiveController
{
    public function __construct(
        private readonly AppraisalCycleRepository $cycles,
        private readonly AppraisalCycleResponseBuilder $responseBuilder,
        private readonly CycleListCache $cache,
        private readonly ReportsCacheService $reportsCache,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/v1/appraisals/cycles/{id}/archive/', name: 'appraisal_cycles_archive', methods: ['POST'], requirements: ['id' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $id): JsonResponse
    {
        $cycle = Uuid::isValid($id) ? $this->cycles->find(Uuid::fromString($id)) : null;
        if ($cycle === null) {
            throw new NotFoundHttpException();
        }

        if ($cycle->getStatus() !== AppraisalCycleStatus::CLOSED) {
            return new JsonResponse(['detail' => 'Only CLOSED cycles can be archived.'], 400);
        }

        $cycle->setStatus(AppraisalCycleStatus::ARCHIVED);
        $this->em->flush();

        $this->cache->invalidateAll();
        $this->reportsCache->invalidateReports((string) $cycle->getId(), null);

        return new JsonResponse($this->responseBuilder->build($cycle));
    }
}
