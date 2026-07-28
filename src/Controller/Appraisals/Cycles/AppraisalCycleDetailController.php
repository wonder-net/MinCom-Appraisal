<?php

declare(strict_types=1);

namespace App\Controller\Appraisals\Cycles;

use App\Entity\AppraisalCycle;
use App\Entity\User;
use App\Enum\AppraisalCycleStatus;
use App\Repository\AppraisalCycleRepository;
use App\Service\AppraisalCycleResponseBuilder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Uid\Uuid;

/**
 * Port of AppraisalCycleViewSet.retrieve(): scoped by the same
 * get_queryset() rule as list() — non-admin users get 404 for a cycle
 * that isn't ACTIVE (DRAFT/CLOSED/ARCHIVED cycles simply aren't in
 * their queryset).
 */
final class AppraisalCycleDetailController
{
    public function __construct(
        private readonly AppraisalCycleRepository $cycles,
        private readonly AppraisalCycleResponseBuilder $responseBuilder,
    ) {
    }

    #[Route('/api/v1/appraisals/cycles/{id}/', name: 'appraisal_cycles_detail', methods: ['GET'], requirements: ['id' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $id, #[CurrentUser] User $user): JsonResponse
    {
        if (!Uuid::isValid($id)) {
            throw new NotFoundHttpException();
        }

        $cycle = $this->cycles->find(Uuid::fromString($id));
        if ($cycle === null) {
            throw new NotFoundHttpException();
        }

        if (!$this->cycles->hasOrgWideVisibility($user) && $cycle->getStatus() !== AppraisalCycleStatus::ACTIVE) {
            throw new NotFoundHttpException();
        }

        return new JsonResponse($this->responseBuilder->build($cycle));
    }
}
