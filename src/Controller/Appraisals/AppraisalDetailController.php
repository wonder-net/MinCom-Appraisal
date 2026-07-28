<?php

declare(strict_types=1);

namespace App\Controller\Appraisals;

use App\Entity\User;
use App\Repository\AppraisalRepository;
use App\Service\AppraisalResponseBuilder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of AppraisalViewSet.retrieve(). Deliberately fetches unscoped so
 * it can distinguish 404 (doesn't exist) from 403 (exists, unauthorized)
 * — a different pattern from EmployeeDetailController's always-404
 * approach, matching Django's own explicit docblock for this endpoint.
 */
final class AppraisalDetailController
{
    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly AppraisalResponseBuilder $responseBuilder,
    ) {
    }

    #[Route('/api/v1/appraisals/{id}/', name: 'appraisals_detail', methods: ['GET'], requirements: ['id' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $appraisal = $this->appraisals->findById($id);
        if ($appraisal === null) {
            throw new NotFoundHttpException();
        }

        if (!$this->appraisals->canUserRead($user, $appraisal)) {
            return new JsonResponse(['detail' => 'You do not have permission to view this appraisal.'], 403);
        }

        return new JsonResponse($this->responseBuilder->buildDetail($appraisal));
    }
}
