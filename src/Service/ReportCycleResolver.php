<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\AppraisalCycle;
use App\Repository\AppraisalCycleRepository;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.reports.views.{_resolve_cycle, _validate_cycle_id_param}.
 * Shared by every reports endpoint that scopes to a cycle: `?cycle_id=`
 * looks up that cycle regardless of status (400 if malformed, 404 if
 * missing); omitted falls back to the ACTIVE cycle (deterministically
 * ordered by -start_date), or null if none is active.
 */
final class ReportCycleResolver
{
    public function __construct(private readonly AppraisalCycleRepository $cycles)
    {
    }

    /**
     * @return array{0: ?AppraisalCycle, 1: ?JsonResponse}
     */
    public function resolve(Request $request): array
    {
        $rawCycleId = $request->query->get('cycle_id');
        if ($rawCycleId !== null) {
            if (!is_string($rawCycleId) || !Uuid::isValid($rawCycleId)) {
                return [null, new JsonResponse(['detail' => 'Invalid cycle_id.'], 400)];
            }

            $cycle = $this->cycles->find(Uuid::fromString($rawCycleId));
            if ($cycle === null) {
                return [null, new JsonResponse(['detail' => 'Cycle not found.'], 404)];
            }

            return [$cycle, null];
        }

        return [$this->cycles->findOneActive(), null];
    }
}
