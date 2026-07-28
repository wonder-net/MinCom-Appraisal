<?php

declare(strict_types=1);

namespace App\Controller\Appraisals;

use App\Entity\User;
use App\Repository\AppraisalRepository;
use App\Repository\KeyDeliverableRepository;
use App\Service\AppraisalAccessChecker;
use App\Service\ScoreEngine;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of KeyDeliverableViewSet.destroy(). Appraisee deletes during
 * SELF_ASSESSMENT; when self_rating_enabled=False the manager may also
 * delete during MANAGER_REVIEW (managerCanCrudKds) — that manager path
 * has no separate status guard call in Django (managerCanCrudKds
 * already implies MANAGER_REVIEW).
 */
final class KeyDeliverableDeleteController
{
    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly KeyDeliverableRepository $keyDeliverables,
        private readonly AppraisalAccessChecker $access,
        private readonly ScoreEngine $scoreEngine,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/v1/appraisals/{appraisalId}/deliverables/{id}/', name: 'appraisal_deliverables_delete', methods: ['DELETE'], requirements: ['appraisalId' => '[0-9a-fA-F-]{36}', 'id' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $appraisalId, string $id, #[CurrentUser] User $user): JsonResponse
    {
        $appraisal = $this->appraisals->findById($appraisalId);
        if ($appraisal === null) {
            throw new NotFoundHttpException();
        }

        $kd = $this->keyDeliverables->findOneByAppraisalAndId($appraisal, $id);
        if ($kd === null) {
            throw new NotFoundHttpException();
        }

        $isAppraisee = $this->access->isAppraisee($user, $appraisal);
        $isManager = $this->access->isManagerOf($user, $appraisal);
        $managerCrudAllowed = $isManager && !$isAppraisee && $this->access->managerCanCrudKds($appraisal);

        if (!$isAppraisee && !$managerCrudAllowed) {
            return new JsonResponse(['detail' => 'You do not have permission to perform this action.'], 403);
        }

        if (!$managerCrudAllowed) {
            $error = $this->access->appraiseeWriteError($appraisal->getStatus());
            if ($error !== null) {
                return new JsonResponse(['detail' => $error], 403);
            }
        }

        $this->em->remove($kd);
        $this->em->flush();

        $this->scoreEngine->computeScores($appraisal);

        return new JsonResponse(null, 204);
    }
}
