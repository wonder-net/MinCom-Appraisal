<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\AuditLog;
use App\Repository\AuditLogRepository;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.audit.models.AuditLog.verify_chain(): validates hash-chain
 * and HMAC integrity across all (or a bounded range of) entries. Not
 * exposed via any HTTP endpoint in Django either — this is a forensic/
 * management-command-style tool, kept as a plain service method here.
 */
final class AuditChainVerifier
{
    public function __construct(
        private readonly AuditLogRepository $auditLogs,
        private readonly string $auditHmacKey,
    ) {
    }

    /**
     * @return array{0: bool, 1: list<string>}
     */
    public function verify(?Uuid $startId = null, ?Uuid $endId = null): array
    {
        $errors = [];

        $startBound = null;
        if ($startId !== null) {
            $startBound = $this->auditLogs->find($startId);
            if ($startBound === null) {
                return [false, ["Start entry {$startId} not found."]];
            }
        }

        $endBound = null;
        if ($endId !== null) {
            $endBound = $this->auditLogs->find($endId);
            if ($endBound === null) {
                return [false, ["End entry {$endId} not found."]];
            }
        }

        $entries = $this->auditLogs->findChain($startBound, $endBound);
        if ($entries === []) {
            return [true, []];
        }

        foreach ($entries as $i => $entry) {
            $expectedHmac = $entry->computeExpectedHmac($this->auditHmacKey);
            if ($entry->getEntryHmac() !== $expectedHmac) {
                $errors[] = "Entry {$entry->getId()}: HMAC mismatch (stored={$entry->getEntryHmac()}, expected={$expectedHmac}).";
            }

            if ($i === 0) {
                if ($startBound !== null) {
                    $predecessor = $this->auditLogs->findPredecessor($entry);
                    $expectedPrev = $predecessor !== null ? $predecessor->computeChainHash() : AuditLog::GENESIS_HASH;
                } else {
                    $expectedPrev = AuditLog::GENESIS_HASH;
                }
            } else {
                $expectedPrev = $entries[$i - 1]->computeChainHash();
            }

            if ($entry->getPreviousHash() !== $expectedPrev) {
                $errors[] = "Entry {$entry->getId()}: previous_hash mismatch (stored={$entry->getPreviousHash()}, expected={$expectedPrev}).";
            }
        }

        return [$errors === [], $errors];
    }
}
