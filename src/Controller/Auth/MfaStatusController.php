<?php

declare(strict_types=1);

namespace App\Controller\Auth;

use App\Entity\User;
use App\Service\MfaService;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of apps.accounts.views.MFAStatusView.
 */
final class MfaStatusController
{
    public function __construct(private readonly MfaService $mfa)
    {
    }

    #[Route('/api/v1/auth/mfa/status/', name: 'auth_mfa_status', methods: ['GET'])]
    public function __invoke(#[CurrentUser] User $user): JsonResponse
    {
        return new JsonResponse([
            'is_mfa_enabled' => $user->isMfaEnabled(),
            'recovery_codes_remaining' => $this->mfa->getRemainingRecoveryCodesCount($user),
        ]);
    }
}
