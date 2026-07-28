<?php

declare(strict_types=1);

namespace App\Controller\Admin\Competencies;

use App\Entity\Competency;
use App\Enum\CompetencyApplicableTo;
use App\Exception\ConflictException;
use App\Repository\CompetencyRepository;
use App\Service\CompetencyCache;
use App\Service\CompetencyResponseBuilder;
use App\Validation\ValidationErrorFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of apps.competencies.views.AdminCompetencyListCreateView.create().
 * HR Admin/SYSTEM_ADMIN only. Returns 409 if a competency with the same
 * name+category already exists (case-insensitive), or if a same-named
 * competency in a different category collides with the DB-level unique
 * constraint on `name`.
 *
 * Audit logging (audit_log_action(...) in Django) is intentionally
 * omitted — the `audit` app is last on the port roadmap and doesn't
 * exist yet, same as every other milestone so far.
 */
#[IsGranted('IS_ADMIN')]
final class AdminCompetencyCreateController
{
    private const DUPLICATE_MESSAGE = 'A competency with this name already exists in the given category';

    public function __construct(
        private readonly CompetencyRepository $competencies,
        private readonly CompetencyResponseBuilder $responseBuilder,
        private readonly CompetencyCache $cache,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/v1/admin/competencies/', name: 'admin_competencies_create', methods: ['POST'])]
    public function __invoke(Request $request): JsonResponse
    {
        $payload = json_decode($request->getContent(), true) ?? [];

        $name = is_string($payload['name'] ?? null) ? trim($payload['name']) : '';
        $categoryRaw = $payload['category'] ?? null;

        $errors = [];
        if ($name === '') {
            $errors['name'] = 'This field is required.';
        }

        $applicableTo = null;
        if ($categoryRaw === null || $categoryRaw === '') {
            $errors['category'] = 'This field is required.';
        } else {
            $applicableTo = CompetencyApplicableTo::tryFrom((string) $categoryRaw);
            if ($applicableTo === null) {
                $errors['category'] = sprintf('"%s" is not a valid choice.', $categoryRaw);
            }
        }

        if ($errors !== []) {
            throw ValidationErrorFactory::fields($errors);
        }

        $isActive = !isset($payload['is_active']) || (bool) $payload['is_active'];

        if ($this->competencies->existsByNameCaseInsensitiveAndApplicableTo($name, $applicableTo)) {
            throw new ConflictException(self::DUPLICATE_MESSAGE);
        }

        $sortOrder = $this->competencies->findMaxSortOrder() + 1;
        $competency = new Competency($name, $applicableTo, $sortOrder, isCore: false);
        $competency->setIsActive($isActive);

        try {
            $this->em->persist($competency);
            $this->em->flush();
        } catch (\Throwable) {
            throw new ConflictException(self::DUPLICATE_MESSAGE);
        }

        $this->cache->invalidateAll();

        return new JsonResponse($this->responseBuilder->build($competency), 201);
    }
}
