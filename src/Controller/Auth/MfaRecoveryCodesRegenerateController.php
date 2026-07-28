<?php

declare(strict_types=1);

namespace App\Controller\Auth;

use App\Dto\Auth\PasswordConfirmationRequest;
use App\Entity\User;
use App\Service\AuditService;
use App\Service\MfaService;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of apps.accounts.views.MFARecoveryCodesRegenerateView.
 */
final class MfaRecoveryCodesRegenerateController
{
    public function __construct(
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly MfaService $mfa,
        private readonly LoggerInterface $logger,
        private readonly AuditService $auditService,
    ) {
    }

    #[Route('/api/v1/auth/mfa/recovery-codes/regenerate/', name: 'auth_mfa_recovery_codes_regenerate', methods: ['POST'])]
    public function __invoke(Request $request, #[MapRequestPayload] PasswordConfirmationRequest $body, #[CurrentUser] User $user): JsonResponse
    {
        if (!$user->isMfaEnabled()) {
            return AuthErrorResponses::simple('MFA is not enabled.', 'MFA_NOT_ENABLED', 400);
        }

        if (!$this->passwordHasher->isPasswordValid($user, $body->password)) {
            return AuthErrorResponses::simple('Invalid password.', 'INVALID_PASSWORD', 400);
        }

        $recoveryCodes = $this->mfa->generateRecoveryCodes($user);

        $this->logger->info('Recovery codes regenerated [user_id={id}]', ['id' => (string) $user->getId()]);
        $this->auditService->log('user.recovery_codes_regenerated', 'User', $user->getId(), $user, null, ['recovery_code_count' => count($recoveryCodes)], $request->getClientIp());

        return new JsonResponse([
            'message' => 'Recovery codes regenerated successfully',
            'recovery_codes' => $recoveryCodes,
        ]);
    }
}
