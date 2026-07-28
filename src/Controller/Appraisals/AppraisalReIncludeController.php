<?php

declare(strict_types=1);

namespace App\Controller\Appraisals;

use App\Enum\AppraisalCycleStatus;
use App\Enum\AppraisalStatus;
use App\Repository\AppraisalRepository;
use App\Service\AppraisalResponseBuilder;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of AppraisalViewSet.re_include(). HR Admin/SYSTEM_ADMIN only.
 * Restores the status stored before exclusion, defaulting to
 * SELF_ASSESSMENT if none was stored.
 */
#[IsGranted('IS_ADMIN')]
final class AppraisalReIncludeController
{
    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly AppraisalResponseBuilder $responseBuilder,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/v1/appraisals/{id}/reinclude/', name: 'appraisals_reinclude', methods: ['POST'], requirements: ['id' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $id): JsonResponse
    {
        $appraisal = $this->appraisals->findById($id);
        if ($appraisal === null) {
            throw new NotFoundHttpException();
        }

        if ($appraisal->getCycle()->getStatus() !== AppraisalCycleStatus::ACTIVE) {
            return new JsonResponse(['detail' => 'Appraisals can only be re-included in ACTIVE cycles.'], 400);
        }

        if ($appraisal->getStatus() !== AppraisalStatus::EXCLUDED) {
            return new JsonResponse(['detail' => 'Only EXCLUDED appraisals can be re-included.'], 400);
        }

        $restored = $appraisal->getPreviousStatus() ?? AppraisalStatus::SELF_ASSESSMENT;
        $appraisal->setStatus($restored);
        $appraisal->setPreviousStatus(null);
        $this->em->flush();

        return new JsonResponse($this->responseBuilder->buildPlain($appraisal));
    }
}
