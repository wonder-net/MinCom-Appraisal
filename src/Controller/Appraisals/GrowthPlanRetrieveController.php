<?php

declare(strict_types=1);

namespace App\Controller\Appraisals;

use App\Entity\User;
use App\Repository\AppraisalRepository;
use App\Repository\GrowthPlanRepository;
use App\Service\GrowthPlanResponseBuilder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of GrowthPlanViewSet.retrieve(). Read access mirrors appraisal
 * read access exactly (org-wide readers, appraisee, effective manager,
 * and — since AppraisalRepository::canUserRead()'s org-hierarchy-manager
 * check doesn't itself consult escalation — the original manager too
 * post-escalation), so it's reused directly rather than re-implementing
 * _user_can_read_growth_plan's RBAC helpers.
 */
final class GrowthPlanRetrieveController
{
    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly GrowthPlanRepository $growthPlans,
        private readonly GrowthPlanResponseBuilder $responseBuilder,
    ) {
    }

    #[Route('/api/v1/appraisals/{appraisalId}/growth-plan/', name: 'appraisal_growth_plan_retrieve', methods: ['GET'], requirements: ['appraisalId' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $appraisalId, #[CurrentUser] User $user): JsonResponse
    {
        $appraisal = $this->appraisals->findById($appraisalId);
        if ($appraisal === null) {
            throw new NotFoundHttpException();
        }

        if (!$this->appraisals->canUserRead($user, $appraisal)) {
            return new JsonResponse(['detail' => 'You do not have permission to view this resource.'], 403);
        }

        $growthPlan = $this->growthPlans->findOneByAppraisal($appraisal);
        if ($growthPlan === null) {
            throw new NotFoundHttpException();
        }

        return new JsonResponse($this->responseBuilder->build($growthPlan));
    }
}
