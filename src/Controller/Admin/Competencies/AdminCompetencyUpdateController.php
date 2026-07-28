<?php

declare(strict_types=1);

namespace App\Controller\Admin\Competencies;

use App\Enum\CompetencyApplicableTo;
use App\Repository\CompetencyRepository;
use App\Service\CompetencyCache;
use App\Service\CompetencyResponseBuilder;
use App\Validation\ValidationErrorFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.competencies.views.AdminCompetencyUpdateView.partial_update().
 * HR Admin/SYSTEM_ADMIN only. `name` and the legacy `category` alias are
 * immutable — any request containing either key is rejected with 400,
 * regardless of value (even resending the unchanged value), matching
 * Django's `provided_fields & disallowed_fields` guard. `applicable_to`,
 * `is_core`, `sort_order`, `is_active` may each be supplied individually
 * or in any combination (diff-only PATCH from the SPA edit dialog).
 *
 * Audit logging is intentionally omitted — see AdminCompetencyCreateController.
 */
#[IsGranted('IS_ADMIN')]
final class AdminCompetencyUpdateController
{
    public function __construct(
        private readonly CompetencyRepository $competencies,
        private readonly CompetencyResponseBuilder $responseBuilder,
        private readonly CompetencyCache $cache,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/v1/admin/competencies/{id}/', name: 'admin_competencies_update', methods: ['PATCH'], requirements: ['id' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $id, Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent(), true) ?? [];

        $disallowed = array_intersect(array_keys($payload), ['name', 'category']);
        if ($disallowed !== []) {
            throw ValidationErrorFactory::fields(array_fill_keys($disallowed, 'This field cannot be updated via this endpoint.'));
        }

        $competency = Uuid::isValid($id) ? $this->competencies->find(Uuid::fromString($id)) : null;
        if ($competency === null) {
            throw new NotFoundHttpException();
        }

        $errors = [];

        $applicableTo = null;
        if (array_key_exists('applicable_to', $payload)) {
            $applicableTo = CompetencyApplicableTo::tryFrom((string) $payload['applicable_to']);
            if ($applicableTo === null) {
                $errors['applicable_to'] = sprintf('"%s" is not a valid choice.', $payload['applicable_to']);
            }
        }

        if (array_key_exists('sort_order', $payload) && (!is_int($payload['sort_order']) || $payload['sort_order'] < 0)) {
            $errors['sort_order'] = 'Ensure this value is greater than or equal to 0.';
        }

        if (array_key_exists('is_core', $payload) && !is_bool($payload['is_core'])) {
            $errors['is_core'] = 'Must be a valid boolean.';
        }

        if (array_key_exists('is_active', $payload) && !is_bool($payload['is_active'])) {
            $errors['is_active'] = 'Must be a valid boolean.';
        }

        if ($errors !== []) {
            throw ValidationErrorFactory::fields($errors);
        }

        if ($applicableTo !== null) {
            $competency->setApplicableTo($applicableTo);
        }
        if (array_key_exists('is_core', $payload)) {
            $competency->setIsCore($payload['is_core']);
        }
        if (array_key_exists('sort_order', $payload)) {
            $competency->setSortOrder($payload['sort_order']);
        }
        if (array_key_exists('is_active', $payload)) {
            $competency->setIsActive($payload['is_active']);
        }

        $this->em->flush();
        $this->cache->invalidateAll();

        return new JsonResponse($this->responseBuilder->build($competency));
    }
}
