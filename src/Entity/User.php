<?php

declare(strict_types=1);

namespace App\Entity;

use App\Enum\RoleName;
use App\Repository\UserRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.accounts.models.User: email-based auth, multi-role RBAC,
 * MFA state, brute-force-protection counters, soft delete (deactivate()
 * sets isActive=false instead of removing the row — see
 * apps.accounts.models.User.delete()).
 */
#[ORM\Entity(repositoryClass: UserRepository::class)]
#[ORM\Table(name: 'user')]
#[ORM\HasLifecycleCallbacks]
class User implements UserInterface, PasswordAuthenticatedUserInterface
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\Column(type: 'string', length: 255, unique: true)]
    private string $email;

    #[ORM\Column(type: 'string')]
    private string $password = '';

    /** @var Collection<int, Role> */
    #[ORM\ManyToMany(targetEntity: Role::class)]
    #[ORM\JoinTable(name: 'user_role')]
    private Collection $assignedRoles;

    #[ORM\Column(type: 'boolean')]
    private bool $isActive = true;

    #[ORM\Column(type: 'boolean')]
    private bool $isStaff = false;

    /**
     * Port of Django's `is_superuser`, but scoped narrowly to this
     * port's actual need: unlocking `/admin` (the EasyAdmin ops panel,
     * this port's equivalent of `/django-admin/`) for an investigative
     * account with no business-facing capability at all — never given
     * an Employee profile or a HR_ADMIN/SYSTEM_ADMIN role, so it's
     * invisible to reports (all of which are Employee/Appraisal
     * -anchored) and locked out of every business-RBAC-gated endpoint,
     * exactly like Django's "naked" superuser (see
     * bootstrap_superuser.py's docstring). Deliberately NOT a general
     * "bypass all permission checks" flag the way Django's is_superuser
     * is for `/django-admin/` — see getRoles(), which only ever adds
     * ROLE_SUPERUSER, never an implicit ROLE_HR_ADMIN/ROLE_SYSTEM_ADMIN.
     */
    #[ORM\Column(type: 'boolean')]
    private bool $isSuperuser = false;

    #[ORM\Column(type: 'boolean')]
    private bool $isMfaEnabled = false;

    // Port of Django's EncryptedCharField for mfa_secret (AES-256-GCM,
    // transparent via App\Doctrine\Type\EncryptedStringType).
    #[ORM\Column(type: 'encrypted_string', nullable: true)]
    private ?string $mfaSecret = null;

    #[ORM\Column(type: 'integer')]
    private int $failedLoginAttempts = 0;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $lockedUntil = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $nextAttemptAfter = null;

    // Port of Django's EncryptedCharField for full_name (AES-256-GCM,
    // transparent via App\Doctrine\Type\EncryptedStringType). No `length`:
    // ciphertext is longer than the plaintext it replaces, so the column
    // is TEXT (see the migration that introduced this).
    #[ORM\Column(type: 'encrypted_string', nullable: true)]
    private ?string $fullName = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $lastPasswordChange = null;

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $lastLogin = null;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $updatedAt;

    public function __construct(string $email)
    {
        $this->id = Uuid::v7();
        $this->email = $email;
        $this->assignedRoles = new ArrayCollection();
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTimeImmutable();
    }

    #[ORM\PreUpdate]
    public function touch(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid
    {
        return $this->id;
    }

    public function getEmail(): string
    {
        return $this->email;
    }

    public function setEmail(string $email): void
    {
        $this->email = $email;
    }

    public function getPassword(): ?string
    {
        return $this->password;
    }

    public function setPassword(string $hashedPassword): void
    {
        $this->password = $hashedPassword;
    }

    /**
     * @return Collection<int, Role>
     */
    public function getAssignedRoles(): Collection
    {
        return $this->assignedRoles;
    }

    public function addRole(Role $role): void
    {
        if (!$this->assignedRoles->contains($role)) {
            $this->assignedRoles->add($role);
        }
    }

    public function removeRole(Role $role): void
    {
        $this->assignedRoles->removeElement($role);
    }

    /**
     * Aliases matching Symfony PropertyAccessor's adder/remover convention
     * for the `assignedRoles` collection (singularized: "AssignedRole",
     * not "Role") — needed so EasyAdmin's roles AssociationField can
     * read/write this collection without a raw setter. Delegates to
     * addRole()/removeRole(); no behavioural difference from calling
     * those directly.
     */
    public function addAssignedRole(Role $role): void
    {
        $this->addRole($role);
    }

    public function removeAssignedRole(Role $role): void
    {
        $this->removeRole($role);
    }

    public function hasRole(RoleName $name): bool
    {
        foreach ($this->assignedRoles as $role) {
            if ($role->getName() === $name) {
                return true;
            }
        }

        return false;
    }

    /**
     * Mirrors User.has_admin_role(): HR_ADMIN and SYSTEM_ADMIN share the same
     * permission surface; centralising the OR-check here means callers don't
     * repeat it at every site.
     */
    public function hasAdminRole(): bool
    {
        return $this->hasRole(RoleName::HR_ADMIN) || $this->hasRole(RoleName::SYSTEM_ADMIN);
    }

    /**
     * @return list<RoleName>
     */
    public function getRoleNames(): array
    {
        // array_values: assignedRoles can have non-sequential internal keys
        // after a removeRole()+addRole() cycle (Doctrine's ArrayCollection
        // doesn't reindex on removal) — json_encode would otherwise emit a
        // JSON object ({"1": "MANAGER"}) instead of an array (["MANAGER"]).
        return array_values(array_map(static fn (Role $role): RoleName => $role->getName(), $this->assignedRoles->toArray()));
    }

    /**
     * @return list<string>
     */
    public function getRoles(): array
    {
        $roles = array_map(
            static fn (RoleName $name): string => 'ROLE_'.$name->value,
            $this->getRoleNames(),
        );
        $roles[] = 'ROLE_USER';
        if ($this->isSuperuser) {
            $roles[] = 'ROLE_SUPERUSER';
        }

        return array_values(array_unique($roles));
    }

    public function eraseCredentials(): void
    {
        // No transient plaintext credentials are ever stored on this entity.
    }

    public function getUserIdentifier(): string
    {
        return $this->email;
    }

    public function isActive(): bool
    {
        return $this->isActive;
    }

    /**
     * General setter — used by admin user-update (PATCH) to both
     * deactivate AND reactivate an account. deactivate() below remains
     * the narrower soft-delete convenience for the User.delete() analogue.
     */
    public function setIsActive(bool $isActive): void
    {
        $this->isActive = $isActive;
        $this->touch();
    }

    /**
     * Soft delete: mirrors User.delete() in Django — never hard-remove a
     * user row, just deactivate it.
     */
    public function deactivate(): void
    {
        $this->setIsActive(false);
    }

    public function isStaff(): bool
    {
        return $this->isStaff;
    }

    public function setIsStaff(bool $isStaff): void
    {
        $this->isStaff = $isStaff;
    }

    public function isSuperuser(): bool
    {
        return $this->isSuperuser;
    }

    public function setIsSuperuser(bool $isSuperuser): void
    {
        $this->isSuperuser = $isSuperuser;
    }

    public function isMfaEnabled(): bool
    {
        return $this->isMfaEnabled;
    }

    public function setIsMfaEnabled(bool $isMfaEnabled): void
    {
        $this->isMfaEnabled = $isMfaEnabled;
    }

    public function getMfaSecret(): ?string
    {
        return $this->mfaSecret;
    }

    public function setMfaSecret(?string $mfaSecret): void
    {
        $this->mfaSecret = $mfaSecret;
    }

    public function getFailedLoginAttempts(): int
    {
        return $this->failedLoginAttempts;
    }

    public function setFailedLoginAttempts(int $failedLoginAttempts): void
    {
        $this->failedLoginAttempts = $failedLoginAttempts;
    }

    public function getLockedUntil(): ?\DateTimeImmutable
    {
        return $this->lockedUntil;
    }

    public function setLockedUntil(?\DateTimeImmutable $lockedUntil): void
    {
        $this->lockedUntil = $lockedUntil;
    }

    public function getNextAttemptAfter(): ?\DateTimeImmutable
    {
        return $this->nextAttemptAfter;
    }

    public function setNextAttemptAfter(?\DateTimeImmutable $nextAttemptAfter): void
    {
        $this->nextAttemptAfter = $nextAttemptAfter;
    }

    public function getFullName(): ?string
    {
        return $this->fullName;
    }

    public function setFullName(?string $fullName): void
    {
        $this->fullName = $fullName;
    }

    public function getLastPasswordChange(): ?\DateTimeImmutable
    {
        return $this->lastPasswordChange;
    }

    public function setLastPasswordChange(?\DateTimeImmutable $lastPasswordChange): void
    {
        $this->lastPasswordChange = $lastPasswordChange;
    }

    public function getLastLogin(): ?\DateTimeImmutable
    {
        return $this->lastLogin;
    }

    public function setLastLogin(?\DateTimeImmutable $lastLogin): void
    {
        $this->lastLogin = $lastLogin;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }

    public function __toString(): string
    {
        return $this->email;
    }
}
