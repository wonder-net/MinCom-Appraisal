<?php

declare(strict_types=1);

namespace App\Controller\Appraisals;

use App\Entity\Appraisal;
use App\Entity\BscPerspective;
use App\Entity\KeyDeliverable;
use App\Entity\User;
use App\Repository\AppraisalRepository;
use App\Service\AppraisalAccessChecker;
use App\Service\KeyDeliverableResponseBuilder;
use App\Service\PerspectiveCapValidator;
use App\Service\PerspectiveKeyResolver;
use App\Service\ScoreEngine;
use App\Validation\ValidationErrorFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of KeyDeliverableViewSet.create(). The appraisee creates KDs
 * during SELF_ASSESSMENT; when the cycle has self_rating_enabled=False,
 * the manager gets full CRUD during MANAGER_REVIEW instead (the
 * appraisee never had a chance to populate them) — see
 * AppraisalAccessChecker::managerCanCrudKds().
 */
final class KeyDeliverableCreateController
{
    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly AppraisalAccessChecker $access,
        private readonly PerspectiveKeyResolver $perspectiveKeys,
        private readonly PerspectiveCapValidator $capValidator,
        private readonly KeyDeliverableResponseBuilder $responseBuilder,
        private readonly ScoreEngine $scoreEngine,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/v1/appraisals/{appraisalId}/deliverables/', name: 'appraisal_deliverables_create', methods: ['POST'], requirements: ['appraisalId' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $appraisalId, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $appraisal = $this->appraisals->findById($appraisalId);
        if ($appraisal === null) {
            throw new NotFoundHttpException();
        }

        $isAppraisee = $this->access->isAppraisee($user, $appraisal);
        $isManager = $this->access->isManagerOf($user, $appraisal);
        $payload = json_decode($request->getContent(), true) ?? [];

        if ($isManager && !$isAppraisee && $this->access->managerCanCrudKds($appraisal)) {
            return $this->create($appraisal, $payload, allowSelfRating: false, allowManagerRating: true);
        }

        if (!$isAppraisee) {
            return new JsonResponse(['detail' => 'You do not have permission to perform this action.'], 403);
        }

        $error = $this->access->appraiseeWriteError($appraisal->getStatus());
        if ($error !== null) {
            return new JsonResponse(['detail' => $error], 403);
        }

        return $this->create(
            $appraisal,
            $payload,
            allowSelfRating: $appraisal->getCycle()->isSelfRatingEnabled(),
            allowManagerRating: false,
        );
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function create(Appraisal $appraisal, array $payload, bool $allowSelfRating, bool $allowManagerRating): JsonResponse
    {
        $errors = [];

        $description = is_string($payload['description'] ?? null) ? trim($payload['description']) : '';
        if ($description === '') {
            $errors['description'] = 'This field is required.';
        }

        $weight = null;
        if (!isset($payload['weight']) || !is_numeric($payload['weight'])) {
            $errors['weight'] = 'This field is required.';
        } else {
            $weight = bcadd((string) $payload['weight'], '0', 4);
            if (bccomp($weight, '0', 4) < 0 || bccomp($weight, '1', 4) > 0) {
                $errors['weight'] = 'Weight must be between 0.0 and 1.0.';
            }
        }

        $perspective = null;
        if (!is_string($payload['perspective'] ?? null) || trim($payload['perspective']) === '') {
            $errors['perspective'] = 'This field is required.';
        } else {
            $perspective = $this->perspectiveKeys->resolve($payload['perspective']);
            if ($perspective === null) {
                $errors['perspective'] = 'Invalid BSC perspective.';
            }
        }

        $selfRating = null;
        if ($allowSelfRating && array_key_exists('self_rating', $payload) && $payload['self_rating'] !== null) {
            $selfRating = bcadd((string) $payload['self_rating'], '0', 2);
            if (bccomp($selfRating, '1.0', 2) < 0 || bccomp($selfRating, '5.0', 2) > 0) {
                $errors['self_rating'] = 'Self rating must be between 1.0 and 5.0.';
            }
        }

        $managerRating = null;
        if ($allowManagerRating && array_key_exists('manager_rating', $payload) && $payload['manager_rating'] !== null) {
            $managerRating = bcadd((string) $payload['manager_rating'], '0', 2);
            if (bccomp($managerRating, '1.0', 2) < 0 || bccomp($managerRating, '5.0', 2) > 0) {
                $errors['manager_rating'] = 'Manager rating must be between 1.0 and 5.0.';
            }
        }

        if ($errors !== []) {
            throw ValidationErrorFactory::fields($errors);
        }

        \assert($perspective instanceof BscPerspective);

        $sortOrder = isset($payload['sort_order']) && is_int($payload['sort_order']) ? $payload['sort_order'] : 0;

        $capError = $this->capValidator->validate($appraisal, $perspective, $weight, excludeKdId: null, isNew: true);
        if ($capError !== null) {
            return new JsonResponse(['detail' => $capError], 400);
        }

        $kd = new KeyDeliverable($appraisal, $perspective, $description, $weight);
        $kd->setSortOrder($sortOrder);
        if ($selfRating !== null) {
            $kd->setSelfRating($selfRating);
        }
        if ($managerRating !== null) {
            $kd->setManagerRating($managerRating);
        }

        $this->em->persist($kd);
        $this->em->flush();

        if ($managerRating !== null) {
            $this->scoreEngine->computeScores($appraisal);
        }

        return new JsonResponse($this->responseBuilder->build($kd), 201);
    }
}
