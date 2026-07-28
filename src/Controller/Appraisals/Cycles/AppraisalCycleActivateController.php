<?php

declare(strict_types=1);

namespace App\Controller\Appraisals\Cycles;

use App\Entity\Appraisal;
use App\Enum\AppraisalCycleStatus;
use App\Repository\AppraisalCycleRepository;
use App\Service\AppraisalCycleResponseBuilder;
use App\Service\AppraisalInstanceBuilder;
use App\Service\ConfigSnapshotBuilder;
use App\Service\CycleListCache;
use App\Service\NotificationService;
use App\Service\ReportsCacheService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Port of AppraisalCycleViewSet.activate(). HR Admin/SYSTEM_ADMIN only.
 * Transitions DRAFT -> ACTIVE, freezes a config snapshot, and bulk-creates
 * Appraisal + CompetencyRating rows for every active, non-executive
 * employee. Wrapped in a single transaction so a failure partway through
 * instance creation rolls back the status change too, matching Django's
 * transaction.atomic() block.
 *
 * Audit logging is intentionally omitted — the `audit` app isn't
 * ported yet.
 */
#[IsGranted('IS_ADMIN')]
final class AppraisalCycleActivateController
{
    public function __construct(
        private readonly AppraisalCycleRepository $cycles,
        private readonly ConfigSnapshotBuilder $configSnapshotBuilder,
        private readonly AppraisalInstanceBuilder $instanceBuilder,
        private readonly AppraisalCycleResponseBuilder $responseBuilder,
        private readonly CycleListCache $cache,
        private readonly NotificationService $notifications,
        private readonly ReportsCacheService $reportsCache,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/v1/appraisals/cycles/{id}/activate/', name: 'appraisal_cycles_activate', methods: ['POST'], requirements: ['id' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $id): JsonResponse
    {
        $cycle = Uuid::isValid($id) ? $this->cycles->find(Uuid::fromString($id)) : null;
        if ($cycle === null) {
            throw new NotFoundHttpException();
        }

        if ($cycle->getStatus() !== AppraisalCycleStatus::DRAFT) {
            return new JsonResponse(['detail' => 'Only DRAFT cycles can be activated.'], 400);
        }

        $configSnapshot = $this->configSnapshotBuilder->build($cycle);

        $this->em->wrapInTransaction(function () use ($cycle, $configSnapshot): void {
            $cycle->setStatus(AppraisalCycleStatus::ACTIVE);
            $cycle->setConfigSnapshot($configSnapshot);
            $this->em->flush();

            $result = $this->instanceBuilder->createForCycle($cycle);

            // Dispatch cycle.activated notification per appraisal: when
            // self_rating_enabled, notify the appraisee (must complete
            // a self-assessment first); otherwise notify the manager
            // (appraisal starts directly in MANAGER_REVIEW). Silently
            // skipped if the employee has no manager assigned.
            $message = sprintf("A new appraisal cycle '%s' has been activated.", $cycle->getPeriodName());
            foreach ($result['appraisals'] as $appraisal) {
                \assert($appraisal instanceof Appraisal);
                if ($cycle->isSelfRatingEnabled()) {
                    $recipient = $appraisal->getEmployee()->getUser();
                } else {
                    $manager = $appraisal->getEmployee()->getManager();
                    if ($manager === null) {
                        continue;
                    }
                    $recipient = $manager->getUser();
                }
                $this->notifications->create($recipient, $appraisal, 'cycle.activated', $message);
            }
        });

        $this->cache->invalidateAll();
        $this->reportsCache->invalidateReports((string) $cycle->getId(), null);

        return new JsonResponse($this->responseBuilder->build($cycle));
    }
}
