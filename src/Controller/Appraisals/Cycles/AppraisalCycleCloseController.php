<?php

declare(strict_types=1);

namespace App\Controller\Appraisals\Cycles;

use App\Enum\AppraisalCycleStatus;
use App\Enum\AppraisalStatus;
use App\Repository\AppraisalCycleRepository;
use App\Repository\AppraisalRepository;
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
 * Port of AppraisalCycleViewSet.close(). HR Admin/SYSTEM_ADMIN only. All
 * non-terminal appraisals in the cycle (see
 * AppraisalRepository::findNonTerminalByCycle) are bulk-transitioned to
 * INCOMPLETE. Audit logging is intentionally omitted — the `audit` app
 * isn't ported yet.
 */
#[IsGranted('IS_ADMIN')]
final class AppraisalCycleCloseController
{
    public function __construct(
        private readonly AppraisalCycleRepository $cycles,
        private readonly AppraisalRepository $appraisals,
        private readonly AppraisalCycleResponseBuilder $responseBuilder,
        private readonly CycleListCache $cache,
        private readonly ReportsCacheService $reportsCache,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/v1/appraisals/cycles/{id}/close/', name: 'appraisal_cycles_close', methods: ['POST'], requirements: ['id' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $id): JsonResponse
    {
        $cycle = Uuid::isValid($id) ? $this->cycles->find(Uuid::fromString($id)) : null;
        if ($cycle === null) {
            throw new NotFoundHttpException();
        }

        if ($cycle->getStatus() !== AppraisalCycleStatus::ACTIVE) {
            return new JsonResponse(['detail' => 'Only ACTIVE cycles can be closed.'], 400);
        }

        $this->em->wrapInTransaction(function () use ($cycle): void {
            foreach ($this->appraisals->findNonTerminalByCycle($cycle) as $appraisal) {
                $appraisal->forceStatus(AppraisalStatus::INCOMPLETE);
            }

            $cycle->setStatus(AppraisalCycleStatus::CLOSED);
            $this->em->flush();
        });

        $this->cache->invalidateAll();
        $this->reportsCache->invalidateReports((string) $cycle->getId(), null);

        return new JsonResponse($this->responseBuilder->build($cycle));
    }
}
