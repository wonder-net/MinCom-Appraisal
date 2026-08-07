<?php

declare(strict_types=1);

namespace App\Controller\Appraisals;

use App\Entity\Appraisal;
use App\Entity\KeyDeliverable;
use App\Entity\User;
use App\Repository\AppraisalRepository;
use App\Repository\KeyDeliverableRepository;
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
 * Port of KeyDeliverableViewSet.partial_update(). Appraisee updates
 * description/weight/perspective/sort_order/self_rating during
 * SELF_ASSESSMENT; manager updates manager_rating only during
 * MANAGER_REVIEW/DISCUSSION/DISPUTED — unless self_rating_enabled=False
 * and status is MANAGER_REVIEW, in which case the manager gets full
 * write access instead (see AppraisalAccessChecker::managerCanCrudKds()).
 */
final class KeyDeliverableUpdateController
{
    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly KeyDeliverableRepository $keyDeliverables,
        private readonly AppraisalAccessChecker $access,
        private readonly PerspectiveKeyResolver $perspectiveKeys,
        private readonly PerspectiveCapValidator $capValidator,
        private readonly KeyDeliverableResponseBuilder $responseBuilder,
        private readonly ScoreEngine $scoreEngine,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/v1/appraisals/{appraisalId}/deliverables/{id}/', name: 'appraisal_deliverables_update', methods: ['PATCH'], requirements: ['appraisalId' => '[0-9a-fA-F-]{36}', 'id' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $appraisalId, string $id, Request $request, #[CurrentUser] User $user): JsonResponse
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
        $isManager = $this->access->isAnyAppraiserOf($user, $appraisal);
        $payload = json_decode($request->getContent(), true) ?? [];

        if ($isManager && !$isAppraisee) {
            $error = $this->access->managerWriteError($appraisal->getStatus());
            if ($error !== null) {
                return new JsonResponse(['detail' => $error], 403);
            }

            $fullWrite = $this->access->managerCanCrudKds($appraisal);

            return $this->update($appraisal, $kd, $payload, allowFullWrite: $fullWrite, allowManagerRating: true, allowSelfRating: false);
        }

        if ($isAppraisee) {
            $error = $this->access->appraiseeWriteError($appraisal->getStatus());
            if ($error !== null) {
                return new JsonResponse(['detail' => $error], 403);
            }

            return $this->update(
                $appraisal,
                $kd,
                $payload,
                allowFullWrite: true,
                allowManagerRating: false,
                allowSelfRating: $appraisal->getCycle()->isSelfRatingEnabled(),
            );
        }

        return new JsonResponse(['detail' => 'You do not have permission to perform this action.'], 403);
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function update(
        Appraisal $appraisal,
        KeyDeliverable $kd,
        array $payload,
        bool $allowFullWrite,
        bool $allowManagerRating,
        bool $allowSelfRating,
    ): JsonResponse {
        $errors = [];
        $newWeight = $kd->getWeight();
        $newPerspective = $kd->getPerspective();

        if ($allowFullWrite) {
            if (array_key_exists('description', $payload)) {
                $description = is_string($payload['description']) ? trim($payload['description']) : '';
                if ($description === '') {
                    $errors['description'] = 'This field may not be blank.';
                }
            }

            if (array_key_exists('weight', $payload)) {
                if (!is_numeric($payload['weight'])) {
                    $errors['weight'] = 'A valid number is required.';
                } else {
                    $newWeight = bcadd((string) $payload['weight'], '0', 4);
                    if (bccomp($newWeight, '0', 4) < 0 || bccomp($newWeight, '1', 4) > 0) {
                        $errors['weight'] = 'Weight must be between 0.0 and 1.0.';
                    }
                }
            }

            if (array_key_exists('perspective', $payload)) {
                $resolved = is_string($payload['perspective']) ? $this->perspectiveKeys->resolve($payload['perspective']) : null;
                if ($resolved === null) {
                    $errors['perspective'] = 'Invalid BSC perspective.';
                } else {
                    $newPerspective = $resolved;
                }
            }

            if (array_key_exists('sort_order', $payload) && !is_int($payload['sort_order'])) {
                $errors['sort_order'] = 'A valid integer is required.';
            }
        }

        if ($allowSelfRating && array_key_exists('self_rating', $payload) && $payload['self_rating'] !== null) {
            $selfRating = bcadd((string) $payload['self_rating'], '0', 2);
            if (bccomp($selfRating, '1.0', 2) < 0 || bccomp($selfRating, '5.0', 2) > 0) {
                $errors['self_rating'] = 'Self rating must be between 1.0 and 5.0.';
            }
        }

        if ($allowManagerRating && array_key_exists('manager_rating', $payload) && $payload['manager_rating'] !== null) {
            $managerRating = bcadd((string) $payload['manager_rating'], '0', 2);
            if (bccomp($managerRating, '1.0', 2) < 0 || bccomp($managerRating, '5.0', 2) > 0) {
                $errors['manager_rating'] = 'Manager rating must be between 1.0 and 5.0.';
            }
        }

        if ($errors !== []) {
            throw ValidationErrorFactory::fields($errors);
        }

        $weightChanged = $allowFullWrite && bccomp($newWeight, $kd->getWeight(), 4) !== 0;
        $perspectiveChanged = $allowFullWrite && !$newPerspective->getId()->equals($kd->getPerspective()->getId());

        if ($weightChanged || $perspectiveChanged) {
            $capError = $this->capValidator->validate($appraisal, $newPerspective, $newWeight, excludeKdId: $kd->getId(), isNew: $perspectiveChanged);
            if ($capError !== null) {
                return new JsonResponse(['detail' => $capError], 400);
            }
        }

        if ($allowFullWrite) {
            if (array_key_exists('description', $payload)) {
                $kd->setDescription(trim($payload['description']));
            }
            if ($weightChanged) {
                $kd->setWeight($newWeight);
            }
            if ($perspectiveChanged) {
                $kd->setPerspective($newPerspective);
            }
            if (array_key_exists('sort_order', $payload)) {
                $kd->setSortOrder($payload['sort_order']);
            }
        }

        if ($allowSelfRating && array_key_exists('self_rating', $payload)) {
            $kd->setSelfRating($payload['self_rating'] !== null ? bcadd((string) $payload['self_rating'], '0', 2) : null);
        }

        $managerRatingProvided = $allowManagerRating && array_key_exists('manager_rating', $payload);
        if ($managerRatingProvided) {
            $kd->setManagerRating($payload['manager_rating'] !== null ? bcadd((string) $payload['manager_rating'], '0', 2) : null);
        }

        $this->em->flush();

        // Scoring re-triggers whenever manager_rating was in the raw
        // payload, regardless of role — matches Django's guard on
        // request.data rather than validated_data.
        if ($managerRatingProvided) {
            $this->scoreEngine->computeScores($appraisal);
        }

        return new JsonResponse($this->responseBuilder->build($kd));
    }
}
