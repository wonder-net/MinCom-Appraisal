<?php

declare(strict_types=1);

namespace App\Controller\Appraisals;

use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Exception\OptimisticLockException;
use App\Exception\TransitionException;
use App\Repository\AppraisalRepository;
use App\Service\AppraisalResponseBuilder;
use App\Service\WorkflowService;
use App\Validation\ValidationErrorFactory;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of AppraisalViewSet.transition(). Pre-checks existence and read
 * access (404/403) before delegating to WorkflowService, which
 * re-fetches the appraisal under a pessimistic lock and re-validates —
 * matching Django's two-query pattern exactly.
 */
final class AppraisalTransitionController
{
    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly WorkflowService $workflow,
        private readonly AppraisalResponseBuilder $responseBuilder,
    ) {
    }

    #[Route('/api/v1/appraisals/{id}/transition/', name: 'appraisals_transition', methods: ['POST'], requirements: ['id' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $id, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $payload = json_decode($request->getContent(), true) ?? [];

        $errors = [];
        $toStatus = null;
        if (!isset($payload['to_status']) || !is_string($payload['to_status'])) {
            $errors['to_status'] = 'This field is required.';
        } else {
            $toStatus = AppraisalStatus::tryFrom($payload['to_status']);
            if ($toStatus === null) {
                $errors['to_status'] = sprintf('"%s" is not a valid choice.', $payload['to_status']);
            }
        }

        $version = null;
        if (!isset($payload['version']) || !is_int($payload['version'])) {
            $errors['version'] = 'This field is required.';
        } elseif ($payload['version'] < 1) {
            $errors['version'] = 'Ensure this value is greater than or equal to 1.';
        } else {
            $version = $payload['version'];
        }

        if ($errors !== []) {
            throw ValidationErrorFactory::fields($errors);
        }

        $appraisalCheck = $this->appraisals->findById($id);
        if ($appraisalCheck === null) {
            throw new NotFoundHttpException();
        }

        if (!$this->appraisals->canUserRead($user, $appraisalCheck)) {
            return new JsonResponse(['detail' => 'You do not have permission to view this appraisal.'], 403);
        }

        try {
            $updated = $this->workflow->doTransition($id, $toStatus, $user, $version);
        } catch (OptimisticLockException $exc) {
            return new JsonResponse(['detail' => $exc->getMessage()], 409);
        } catch (TransitionException $exc) {
            $statusCode = $exc->transitionCode === 'WRONG_ROLE' ? 403 : 400;

            return new JsonResponse(['detail' => $exc->getMessage(), 'code' => $exc->transitionCode], $statusCode);
        }

        if ($updated === null) {
            throw new NotFoundHttpException();
        }

        return new JsonResponse($this->responseBuilder->buildPlain($updated));
    }
}
