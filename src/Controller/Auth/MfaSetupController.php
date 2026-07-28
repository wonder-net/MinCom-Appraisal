<?php

declare(strict_types=1);

namespace App\Controller\Auth;

use App\Entity\User;
use App\Service\MfaService;
use App\Service\MfaSetupCache;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of apps.accounts.views.MFASetupView: generates a TOTP secret and
 * stores it provisionally (not on the user yet) until MfaVerifyController
 * confirms it with a real code from the authenticator app.
 */
final class MfaSetupController
{
    public function __construct(
        private readonly MfaService $mfa,
        private readonly MfaSetupCache $setupCache,
        private readonly LoggerInterface $logger,
    ) {
    }

    #[Route('/api/v1/auth/mfa/setup/', name: 'auth_mfa_setup', methods: ['POST'])]
    public function __invoke(#[CurrentUser] User $user): JsonResponse
    {
        if ($user->isMfaEnabled()) {
            return AuthErrorResponses::simple('MFA is already enabled.', 'MFA_ALREADY_ENABLED', 400);
        }

        $secret = $this->mfa->generateSecret();
        $this->setupCache->store((string) $user->getId(), $secret);

        $this->logger->info('MFA setup initiated [user_id={id}]', ['id' => (string) $user->getId()]);

        return new JsonResponse([
            'provisioning_uri' => $this->mfa->getProvisioningUri($user, $secret),
            'secret' => $secret,
        ]);
    }
}
