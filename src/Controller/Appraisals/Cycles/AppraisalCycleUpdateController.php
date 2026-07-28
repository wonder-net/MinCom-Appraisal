<?php

declare(strict_types=1);

namespace App\Controller\Appraisals\Cycles;

use App\Entity\AppraisalCycle;
use App\Enum\AppraisalCycleStatus;
use App\Repository\AppraisalCycleRepository;
use App\Service\AppraisalCycleResponseBuilder;
use App\Service\CycleListCache;
use App\Validation\ValidationErrorFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Port of AppraisalCycleViewSet.partial_update(). HR Admin/SYSTEM_ADMIN
 * only. Only DRAFT cycles may be updated (400 otherwise) — matches
 * Django's `{"detail": "Only DRAFT cycles can be updated."}` shape.
 */
#[IsGranted('IS_ADMIN')]
final class AppraisalCycleUpdateController
{
    public function __construct(
        private readonly AppraisalCycleRepository $cycles,
        private readonly AppraisalCycleResponseBuilder $responseBuilder,
        private readonly CycleListCache $cache,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/v1/appraisals/cycles/{id}/', name: 'appraisal_cycles_update', methods: ['PATCH'], requirements: ['id' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $id, Request $request): JsonResponse
    {
        $cycle = Uuid::isValid($id) ? $this->cycles->find(Uuid::fromString($id)) : null;
        if ($cycle === null) {
            throw new NotFoundHttpException();
        }

        if ($cycle->getStatus() !== AppraisalCycleStatus::DRAFT) {
            return new JsonResponse(['detail' => 'Only DRAFT cycles can be updated.'], 400);
        }

        $payload = json_decode($request->getContent(), true) ?? [];
        $errors = [];

        $startDate = $cycle->getStartDate();
        $endDate = $cycle->getEndDate();

        if (array_key_exists('period_name', $payload)) {
            $periodName = is_string($payload['period_name']) ? trim($payload['period_name']) : '';
            if ($periodName === '') {
                $errors['period_name'] = 'This field may not be blank.';
            }
        }

        if (array_key_exists('start_date', $payload)) {
            $startDate = $this->parseDate($payload['start_date']);
            if ($startDate === null) {
                $errors['start_date'] = 'Must be a valid date (YYYY-MM-DD).';
            }
        }

        if (array_key_exists('end_date', $payload)) {
            $endDate = $this->parseDate($payload['end_date']);
            if ($endDate === null) {
                $errors['end_date'] = 'Must be a valid date (YYYY-MM-DD).';
            }
        }

        if ($startDate !== null && $endDate !== null && $startDate >= $endDate) {
            $errors['end_date'] = 'End date must be after start date.';
        }

        if (array_key_exists('self_rating_enabled', $payload) && !is_bool($payload['self_rating_enabled'])) {
            $errors['self_rating_enabled'] = 'Must be a valid boolean.';
        }

        if ($errors !== []) {
            throw ValidationErrorFactory::fields($errors);
        }

        if (array_key_exists('period_name', $payload)) {
            $cycle->setPeriodName(trim($payload['period_name']));
        }
        if ($startDate !== null) {
            $cycle->setStartDate($startDate);
        }
        if ($endDate !== null) {
            $cycle->setEndDate($endDate);
        }
        if (array_key_exists('self_rating_enabled', $payload)) {
            $cycle->setSelfRatingEnabled($payload['self_rating_enabled']);
        }

        $this->em->flush();
        $this->cache->invalidateAll();

        return new JsonResponse($this->responseBuilder->build($cycle));
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
