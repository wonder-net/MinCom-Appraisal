<?php

declare(strict_types=1);

namespace App\Service;

use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.appraisals.views._hash_reason: a salted SHA-256 hex
 * digest of the escalation reason, used to anchor a tamper-evident
 * fingerprint in notification metadata without persisting the
 * plaintext reason there (the encrypted `Appraisal.escalationReason`
 * column is the source of truth). Salted with the appraisal id so
 * identical reason strings across different appraisals don't produce
 * matching digests.
 */
final class EscalationReasonHasher
{
    public function hash(string $reason, Uuid $appraisalId): string
    {
        return hash('sha256', $appraisalId.':'.$reason);
    }
}
