<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Signature;
use App\Repository\EmployeeRepository;

/**
 * Port of apps.appraisals.serializers.SignatureResponseSerializer — the
 * 201-response shape for POST .../sign/, which deliberately excludes
 * the forensic fields (ip_address, user_agent_hash) and signing_round
 * that the nested read shape (SignatureResponseBuilder, used inside
 * AppraisalDetailSerializer's `signatures` array) includes.
 */
final class SignatureSignResponseBuilder
{
    public function __construct(private readonly EmployeeRepository $employees)
    {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(Signature $signature): array
    {
        $signer = $signature->getSigner();
        $profile = $this->employees->findByUser($signer);

        return [
            'id' => (string) $signature->getId(),
            'appraisal_id' => (string) $signature->getAppraisal()->getId(),
            'signer_id' => (string) $signer->getId(),
            'signer_name' => $profile !== null ? $profile->getName() : $signer->getEmail(),
            'signer_role' => $signature->getSignerRole()->value,
            'action' => $signature->getAction()->value,
            'discussed' => $signature->isDiscussed(),
            'reason' => $signature->getReason(),
            'signed_at' => $signature->getSignedAt()->format(\DateTimeInterface::ATOM),
        ];
    }
}
