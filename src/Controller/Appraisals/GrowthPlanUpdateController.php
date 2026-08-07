<?php

declare(strict_types=1);

namespace App\Controller\Appraisals;

use App\Entity\GrowthPlan;
use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\GrowthPlan\GrowthPlanChildrenReplacer;
use App\GrowthPlan\GrowthPlanWriteValidator;
use App\Repository\AppraisalRepository;
use App\Repository\GrowthPlanRepository;
use App\Service\AppraisalAccessChecker;
use App\Service\GrowthPlanResponseBuilder;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of GrowthPlanViewSet.partial_update(). Only fields present in
 * the raw request body are touched — `overall_assessment` and each of
 * the 4 child arrays are independent: a PATCH with only `career_plans`
 * leaves strengths_weaknesses/training_needs/development_needs/
 * overall_assessment completely untouched.
 *
 * Audit logging is intentionally omitted — the `audit` app isn't
 * ported yet.
 */
final class GrowthPlanUpdateController
{
    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly GrowthPlanRepository $growthPlans,
        private readonly AppraisalAccessChecker $access,
        private readonly GrowthPlanWriteValidator $validator,
        private readonly GrowthPlanChildrenReplacer $childrenReplacer,
        private readonly GrowthPlanResponseBuilder $responseBuilder,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/v1/appraisals/{appraisalId}/growth-plan/', name: 'appraisal_growth_plan_update', methods: ['PATCH'], requirements: ['appraisalId' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $appraisalId, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $appraisal = $this->appraisals->findById($appraisalId);
        if ($appraisal === null) {
            throw new NotFoundHttpException();
        }

        if (!($user->hasAdminRole() || $this->access->isAnyAppraiserOf($user, $appraisal))) {
            return new JsonResponse(['detail' => 'You do not have permission to perform this action.'], 403);
        }

        if ($appraisal->getStatus() !== AppraisalStatus::GROWTH_PLANNING) {
            return new JsonResponse(['detail' => 'Growth plan can only be edited during GROWTH_PLANNING status.'], 403);
        }

        $growthPlanCheck = $this->growthPlans->findOneByAppraisal($appraisal);
        if ($growthPlanCheck === null) {
            throw new NotFoundHttpException();
        }

        $payload = json_decode($request->getContent(), true) ?? [];
        $data = $this->validator->validate($payload);

        $growthPlan = $this->em->wrapInTransaction(function () use ($appraisal, $data): ?GrowthPlan {
            $growthPlan = $this->growthPlans->findOneByAppraisalForUpdate($appraisal);
            if ($growthPlan === null) {
                return null;
            }

            if ($data->hasOverallAssessment) {
                $growthPlan->setOverallAssessment($data->overallAssessment);
            }
            if ($data->hasPromotionRecommendation) {
                $growthPlan->setPromotionRecommendation($data->promotionRecommendation);
            }
            if ($data->hasPotentialRating) {
                $growthPlan->setPotentialRating($data->potentialRating);
            }
            if ($data->hasStrengthsWeaknesses) {
                $this->childrenReplacer->replaceStrengthsWeaknesses($growthPlan, $data->strengthsWeaknesses);
            }
            if ($data->hasTrainingNeeds) {
                $this->childrenReplacer->replaceTrainingNeeds($growthPlan, $data->trainingNeeds);
            }
            if ($data->hasCareerPlans) {
                $this->childrenReplacer->replaceCareerPlans($growthPlan, $data->careerPlans);
            }
            if ($data->hasDevelopmentNeeds) {
                $this->childrenReplacer->replaceDevelopmentNeeds($growthPlan, $data->developmentNeeds);
            }

            $this->em->flush();

            return $growthPlan;
        });

        if ($growthPlan === null) {
            throw new NotFoundHttpException();
        }

        return new JsonResponse($this->responseBuilder->build($growthPlan));
    }
}
