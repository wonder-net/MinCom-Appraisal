<?php

declare(strict_types=1);

namespace App\Controller\Appraisals\Cycles;

use App\Entity\AppraisalCycle;
use App\Entity\User;
use App\Service\AppraisalCycleResponseBuilder;
use App\Service\CycleListCache;
use App\Validation\ValidationErrorFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Port of AppraisalCycleViewSet.create(). HR Admin/SYSTEM_ADMIN only.
 * New cycles always start in DRAFT status.
 */
#[IsGranted('IS_ADMIN')]
final class AppraisalCycleCreateController
{
    public function __construct(
        private readonly AppraisalCycleResponseBuilder $responseBuilder,
        private readonly CycleListCache $cache,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/v1/appraisals/cycles/', name: 'appraisal_cycles_create', methods: ['POST'])]
    public function __invoke(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $payload = json_decode($request->getContent(), true) ?? [];

        $errors = [];
        $periodName = is_string($payload['period_name'] ?? null) ? trim($payload['period_name']) : '';
        if ($periodName === '') {
            $errors['period_name'] = 'This field is required.';
        }

        $startDate = $this->parseDate($payload['start_date'] ?? null);
        if (($payload['start_date'] ?? null) === null || $startDate === null) {
            $errors['start_date'] = 'This field is required and must be a valid date (YYYY-MM-DD).';
        }

        $endDate = $this->parseDate($payload['end_date'] ?? null);
        if (($payload['end_date'] ?? null) === null || $endDate === null) {
            $errors['end_date'] = 'This field is required and must be a valid date (YYYY-MM-DD).';
        }

        if ($startDate !== null && $endDate !== null && $startDate >= $endDate) {
            $errors['end_date'] = 'End date must be after start date.';
        }

        if ($errors !== []) {
            throw ValidationErrorFactory::fields($errors);
        }

        $selfRatingEnabled = !isset($payload['self_rating_enabled']) || (bool) $payload['self_rating_enabled'];

        $cycle = new AppraisalCycle($periodName, $startDate, $endDate, $user, $selfRatingEnabled);

        $this->em->persist($cycle);
        $this->em->flush();

        $this->cache->invalidateAll();

        return new JsonResponse($this->responseBuilder->build($cycle), 201);
    }

    private function parseDate(mixed $value): ?\DateTimeImmutable
    {
        if (!is_string($value) || $value === '') {
            return null;
        }

        $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);

        return $date !== false ? $date : null;
    }
}
