<?php

declare(strict_types=1);

namespace App\Entity;

use App\Enum\AppraisalPartyRole;
use App\Enum\SignatureAction;
use App\Repository\SignatureRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.appraisals.models.Signature. Uniqueness is scoped to the
 * current sign-off round — (appraisal, signer, signingRound) — so
 * prior-round signatures remain as an immutable audit trail without
 * blocking a new round after a dispute round-trip.
 */
#[ORM\Entity(repositoryClass: SignatureRepository::class)]
#[ORM\Table(name: 'appraisal_signature')]
#[ORM\UniqueConstraint(name: 'unique_signature_per_appraisal_signer_per_round', columns: ['appraisal_id', 'signer_id', 'signing_round'])]
class Signature
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne(targetEntity: Appraisal::class)]
    #[ORM\JoinColumn(name: 'appraisal_id', nullable: false, onDelete: 'CASCADE')]
    private Appraisal $appraisal;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'signer_id', nullable: false)]
    private User $signer;

    #[ORM\Column(type: 'string', length: 10, enumType: AppraisalPartyRole::class)]
    private AppraisalPartyRole $signerRole;

    #[ORM\Column(type: 'string', length: 20, enumType: SignatureAction::class)]
    private SignatureAction $action;

    #[ORM\Column(type: 'boolean')]
    private bool $discussed = false;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $reason = null;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $signedAt;

    #[ORM\Column(type: 'string', length: 45)]
    private string $ipAddress;

    #[ORM\Column(type: 'string', length: 64)]
    private string $userAgentHash;

    #[ORM\Column(type: 'integer')]
    private int $signingRound;

    public function __construct(
        Appraisal $appraisal,
        User $signer,
        AppraisalPartyRole $signerRole,
        SignatureAction $action,
        \DateTimeImmutable $signedAt,
        string $ipAddress,
        string $userAgentHash,
        int $signingRound,
    ) {
        $this->id = Uuid::v7();
        $this->appraisal = $appraisal;
        $this->signer = $signer;
        $this->signerRole = $signerRole;
        $this->action = $action;
        $this->signedAt = $signedAt;
        $this->ipAddress = $ipAddress;
        $this->userAgentHash = $userAgentHash;
        $this->signingRound = $signingRound;
    }

    public function getId(): Uuid
    {
        return $this->id;
    }

    public function getAppraisal(): Appraisal
    {
        return $this->appraisal;
    }

    public function getSigner(): User
    {
        return $this->signer;
    }

    public function getSignerRole(): AppraisalPartyRole
    {
        return $this->signerRole;
    }

    public function getAction(): SignatureAction
    {
        return $this->action;
    }

    public function isDiscussed(): bool
    {
        return $this->discussed;
    }

    public function setDiscussed(bool $discussed): void
    {
        $this->discussed = $discussed;
    }

    public function getReason(): ?string
    {
        return $this->reason;
    }

    public function setReason(?string $reason): void
    {
        $this->reason = $reason;
    }

    public function getSignedAt(): \DateTimeImmutable
    {
        return $this->signedAt;
    }

    public function getIpAddress(): string
    {
        return $this->ipAddress;
    }

    public function getUserAgentHash(): string
    {
        return $this->userAgentHash;
    }

    public function getSigningRound(): int
    {
        return $this->signingRound;
    }
}
