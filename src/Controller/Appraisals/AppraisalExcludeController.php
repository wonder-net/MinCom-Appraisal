<?php

declare(strict_types=1);

namespace App\Controller\Appraisals;

use App\Enum\AppraisalCycleStatus;
use App\Enum\AppraisalStatus;
use App\Repository\AppraisalRepository;
use App\Service\AppraisalAccessChecker;
use App\Service\AppraisalResponseBuilder;
use App\Validation\ValidationErrorFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of AppraisalViewSet.exclude(). HR Admin/SYSTEM_ADMIN only. Sets
 * status to EXCLUDED, storing the previous status so re-include can
 * restore it.
 */
#[IsGranted('IS_ADMIN')]
final class AppraisalExcludeController
{
    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly AppraisalAccessChecker $access,
        private readonly AppraisalResponseBuilder $responseBuilder,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/v1/appraisals/{id}/exclude/', name: 'appraisals_exclude', methods: ['POST'], requirements: ['id' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $id, Request $request): JsonResponse
    {
        $appraisal = $this->appraisals->findById($id);
        if ($appraisal === null) {
            throw new NotFoundHttpException();
        }

        $payload = json_decode($request->getContent(), true) ?? [];
        $reason = is_string($payload['reason'] ?? null) ? $payload['reason'] : '';
        if (trim($reason) === '') {
            throw ValidationErrorFactory::field('reason', 'This field is required.');
        }
        if (strlen($reason) > 1000) {
            throw ValidationErrorFactory::field('reason', 'Ensure this field has no more than 1000 characters.');
        }

        if ($appraisal->getCycle()->getStatus() !== AppraisalCycleStatus::ACTIVE) {
            return new JsonResponse(['detail' => 'Appraisals can only be excluded from ACTIVE cycles.'], 400);
        }

        if ($this->access->isTerminalStatus($appraisal->getStatus())) {
            return new JsonResponse(['detail' => sprintf('Cannot exclude an appraisal in %s status.', $appraisal->getStatus()->value)], 400);
        }

        $oldStatus = $appraisal->getStatus();
        $appraisal->setPreviousStatus($oldStatus);
        $appraisal->setStatus(AppraisalStatus::EXCLUDED);
        $this->em->flush();

        return new JsonResponse($this->responseBuilder->buildPlain($appraisal));
    }
}
