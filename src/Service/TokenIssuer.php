<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\User;
use Gesdinet\JWTRefreshTokenBundle\Generator\RefreshTokenGeneratorInterface;
use Gesdinet\JWTRefreshTokenBundle\Model\RefreshTokenManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;

/**
 * Mints a fresh access+refresh token pair for a user establishing a brand
 * new session — used by LoginController, MfaVerifyController (enrollment
 * completion), and MfaVerifyLoginController (the login MFA challenge).
 * Each of these mirrors Django's identical `CustomTokenObtainPairSerializer
 * .get_token(user)` call at the same three call sites.
 *
 * Not used by TokenRefreshController, which rotates an *existing* session
 * (carrying sessionStart forward via PendingSessionContext) rather than
 * starting a new one.
 */
final class TokenIssuer
{
    public function __construct(
        private readonly JWTTokenManagerInterface $jwtManager,
        private readonly RefreshTokenGeneratorInterface $refreshTokenGenerator,
        private readonly RefreshTokenManagerInterface $refreshTokenManager,
        private readonly int $refreshTokenTtl,
    ) {
    }

    /**
     * @return array{access: string, refresh: string}
     */
    public function issueForNewSession(User $user): array
    {
        $accessToken = $this->jwtManager->create($user);
        $refreshToken = $this->refreshTokenGenerator->createForUserWithTtl($user, $this->refreshTokenTtl);
        $this->refreshTokenManager->save($refreshToken);

        return ['access' => $accessToken, 'refresh' => $refreshToken->getRefreshToken()];
    }
}
