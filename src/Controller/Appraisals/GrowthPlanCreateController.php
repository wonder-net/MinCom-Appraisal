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
 * Port of GrowthPlanViewSet.create() — upsert semantics: creates a new
 * GrowthPlan (201) or fully replaces an existing one (200), including
 * wiping out any child array not present in the request body (POST
 * treats every field as present-with-empty-default, unlike PATCH — see
 * GrowthPlanWriteData's docblock).
 *
 * Audit logging (audit_log_action("growth_plan.created"/".updated"))
 * is intentionally omitted — the `audit` app isn't ported yet.
 */
final class GrowthPlanCreateController
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

    #[Route('/api/v1/appraisals/{appraisalId}/growth-plan/', name: 'appraisal_growth_plan_create', methods: ['POST'], requirements: ['appraisalId' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $appraisalId, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $appraisal = $this->appraisals->findById($appraisalId);
        if ($appraisal === null) {
            throw new NotFoundHttpException();
        }

        if (!($user->hasAdminRole() || $this->access->isManagerOf($user, $appraisal))) {
            return new JsonResponse(['detail' => 'You do not have permission to perform this action.'], 403);
        }

        if ($appraisal->getStatus() !== AppraisalStatus::GROWTH_PLANNING) {
            return new JsonResponse(['detail' => 'Growth plan can only be created during GROWTH_PLANNING status.'], 403);
        }

        $payload = json_decode($request->getContent(), true) ?? [];
        $data = $this->validator->validate($payload);

        [$growthPlan, $wasCreated] = $this->em->wrapInTransaction(function () use ($appraisal, $data): array {
            $existing = $this->growthPlans->findOneByAppraisalForUpdate($appraisal);
            $wasCreated = $existing === null;

            if ($existing !== null) {
                $existing->setOverallAssessment($data->overallAssessment);
                $growthPlan = $existing;
            } else {
                $growthPlan = new GrowthPlan($appraisal, $data->overallAssessment);
                $this->em->persist($growthPlan);
                $this->em->flush();
            }

            $this->childrenReplacer->replaceStrengthsWeaknesses($growthPlan, $data->strengthsWeaknesses);
            $this->childrenReplacer->replaceTrainingNeeds($growthPlan, $data->trainingNeeds);
            $this->childrenReplacer->replaceCareerPlans($growthPlan, $data->careerPlans);
            $this->childrenReplacer->replaceDevelopmentNeeds($growthPlan, $data->developmentNeeds);

            $this->em->flush();

            return [$growthPlan, $wasCreated];
        });

        return new JsonResponse($this->responseBuilder->build($growthPlan), $wasCreated ? 201 : 200);
    }
}
