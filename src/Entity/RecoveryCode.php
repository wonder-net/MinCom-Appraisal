<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\RecoveryCodeRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.accounts.models.RecoveryCode: single-use MFA recovery code,
 * stored as a bcrypt hash only — the plaintext is shown to the user exactly
 * once at generation time (see MfaService::generateRecoveryCodes).
 */
#[ORM\Entity(repositoryClass: RecoveryCodeRepository::class)]
#[ORM\Table(name: 'recovery_code')]
#[ORM\Index(name: 'idx_recovery_user_unused', columns: ['user_id', 'is_used'])]
class RecoveryCode
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $user;

    #[ORM\Column(type: 'string', length: 128)]
    private string $codeHash;

    #[ORM\Column(type: 'boolean')]
    private bool $isUsed = false;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $usedAt = null;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    public function __construct(User $user, string $codeHash)
    {
        $this->id = Uuid::v7();
        $this->user = $user;
        $this->codeHash = $codeHash;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid
    {
        return $this->id;
    }

    public function getUser(): User
    {
        return $this->user;
    }

    public function getCodeHash(): string
    {
        return $this->codeHash;
    }

    public function isUsed(): bool
    {
        return $this->isUsed;
    }

    public function markUsed(\DateTimeImmutable $when): void
    {
        $this->isUsed = true;
        $this->usedAt = $when;
    }
}
