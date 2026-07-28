<?php

declare(strict_types=1);

namespace App\Service;

use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Uid\Uuid;

/**
 * Port of AuditLogListView.FILTER_PARAMS/_apply_filters: reads the
 * `action`, `resource_type`, `resource_id`, `user_id`, `timestamp__gte`,
 * `timestamp__lte` query params (kept as literal Django-style names —
 * the frontend sends them exactly this way) into the filter shape
 * AuditLogRepository expects. Malformed UUID/datetime values are
 * silently dropped rather than erroring, since Django's own filtering
 * has no explicit validation for these optional query params either.
 */
final class AuditLogFilterParser
{
    /**
     * @return array<string, mixed>
     */
    public function parse(Request $request): array
    {
        $filters = [];

        $action = $request->query->get('action');
        if (is_string($action) && $action !== '') {
            $filters['action'] = $action;
        }

        $resourceType = $request->query->get('resource_type');
        if (is_string($resourceType) && $resourceType !== '') {
            $filters['resourceType'] = $resourceType;
        }

        $resourceId = $request->query->get('resource_id');
        if (is_string($resourceId) && $resourceId !== '' && Uuid::isValid($resourceId)) {
            $filters['resourceId'] = Uuid::fromString($resourceId);
        }

        $userId = $request->query->get('user_id');
        if (is_string($userId) && $userId !== '' && Uuid::isValid($userId)) {
            $filters['userId'] = Uuid::fromString($userId);
        }

        $gte = $request->query->get('timestamp__gte');
        if (is_string($gte) && $gte !== '') {
            $ts = $this->parseTimestamp($gte);
            if ($ts !== null) {
                $filters['timestampGte'] = $ts;
            }
        }

        $lte = $request->query->get('timestamp__lte');
        if (is_string($lte) && $lte !== '') {
            $ts = $this->parseTimestamp($lte);
            if ($ts !== null) {
                $filters['timestampLte'] = $ts;
            }
        }

        return $filters;
    }

    private function parseTimestamp(string $value): ?\DateTimeImmutable
    {
        try {
            return new \DateTimeImmutable($value);
        } catch (\Exception) {
            return null;
        }
    }
}
