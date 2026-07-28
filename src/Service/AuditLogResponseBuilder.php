<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\AuditLog;
use App\Repository\UserRepository;

/**
 * Port of apps.audit.serializers.{AuditLogSerializer, build_user_email_map}.
 * `user_email` is resolved from the User table at build time (AuditLog
 * stores only a raw UUID, not a live FK) — batched across a page to
 * avoid N+1 queries, mirroring Django's `user_email_map` context.
 */
final class AuditLogResponseBuilder
{
    public function __construct(private readonly UserRepository $users)
    {
    }

    /**
     * @param list<AuditLog> $entries
     * @return list<array<string, mixed>>
     */
    public function buildMany(array $entries): array
    {
        $emailMap = $this->buildUserEmailMap($entries);

        return array_map(fn (AuditLog $entry) => $this->buildOne($entry, $emailMap), $entries);
    }

    /**
     * @param list<AuditLog> $entries
     * @return array<string, string>
     */
    private function buildUserEmailMap(array $entries): array
    {
        $userIds = [];
        foreach ($entries as $entry) {
            $userId = $entry->getUserId();
            if ($userId !== null) {
                $userIds[(string) $userId] = $userId;
            }
        }
        if ($userIds === []) {
            return [];
        }

        $map = [];
        foreach ($this->users->findBy(['id' => array_values($userIds)]) as $user) {
            $map[(string) $user->getId()] = $user->getEmail();
        }

        return $map;
    }

    /**
     * @param array<string, string> $emailMap
     * @return array<string, mixed>
     */
    private function buildOne(AuditLog $entry, array $emailMap): array
    {
        $userId = $entry->getUserId();

        return [
            'id' => (string) $entry->getId(),
            'user_email' => $userId !== null ? ($emailMap[(string) $userId] ?? null) : null,
            'action' => $entry->getAction(),
            'resource_type' => $entry->getResourceType(),
            'resource_id' => (string) $entry->getResourceId(),
            'old_value_hash' => $entry->getOldValueHash(),
            'new_value_hash' => $entry->getNewValueHash(),
            'metadata' => $entry->getMetadata(),
            'ip_address' => $entry->getIpAddress(),
            'timestamp' => $entry->getTimestamp()->format(\DateTimeInterface::ATOM),
        ];
    }
}
