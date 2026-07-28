<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\RefreshTokenRepository;
use Doctrine\ORM\Mapping as ORM;
use Gesdinet\JWTRefreshTokenBundle\Model\AbstractRefreshToken;

/**
 * Gesdinet refresh token, extended with a sessionStart column.
 *
 * session_start is set once when a session is first established (login) and
 * copied forward on every rotation (see JwtCreatedListener /
 * TokenRefreshController) — never reset to "now" on refresh. This mirrors
 * Django's CustomTokenObtainPairSerializer: the claim enforces an *absolute*
 * session timeout independent of the sliding access-token expiry, and would
 * be defeated if it were reset on every rotation the way Gesdinet resets
 * `valid` (the refresh token's own expiry).
 */
#[ORM\Entity(repositoryClass: RefreshTokenRepository::class)]
#[ORM\Table(name: 'refresh_tokens')]
#[ORM\Index(name: 'idx_refresh_tokens_username', columns: ['username'])]
class RefreshToken extends AbstractRefreshToken
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    protected int|string|null $id = null;

    #[ORM\Column(type: 'string', length: 128, unique: true)]
    protected ?string $refreshToken = null;

    #[ORM\Column(type: 'string', length: 255)]
    protected ?string $username = null;

    #[ORM\Column(type: 'datetime')]
    protected ?\DateTimeInterface $valid = null;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $sessionStart;

    public function __construct()
    {
        $this->sessionStart = new \DateTimeImmutable();
    }

    public function getSessionStart(): \DateTimeImmutable
    {
        return $this->sessionStart;
    }

    public function setSessionStart(\DateTimeImmutable $sessionStart): static
    {
        $this->sessionStart = $sessionStart;

        return $this;
    }
}
