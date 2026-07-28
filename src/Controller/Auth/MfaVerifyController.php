<?php

declare(strict_types=1);

namespace App\Controller\Auth;

use App\Dto\Auth\MfaVerifyRequest;
use App\Entity\User;
use App\Service\AuditService;
use App\Service\MfaService;
use App\Service\MfaSetupCache;
use App\Service\TokenIssuer;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of apps.accounts.views.MFAVerifyView: confirms MFA enrollment by
 * checking a real TOTP code against the provisional secret, then persists
 * it, enables MFA, generates recovery codes, and — like Django — issues a
 * brand new token pair (the access token's is_mfa_enabled/must_change_password
 * claims need to reflect the just-completed enrollment).
 */
final class MfaVerifyController
{
    public function __construct(
        private readonly MfaService $mfa,
        private readonly MfaSetupCache $setupCache,
        private readonly TokenIssuer $tokenIssuer,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
        private readonly AuditService $auditService,
    ) {
    }

    #[Route('/api/v1/auth/mfa/verify/', name: 'auth_mfa_verify', methods: ['POST'])]
    public function __invoke(Request $request, #[MapRequestPayload] MfaVerifyRequest $body, #[CurrentUser] User $user): JsonResponse
    {
        $provisionalSecret = $this->setupCache->get((string) $user->getId());

        if ($provisionalSecret === null) {
            return AuthErrorResponses::simple(
                'No MFA setup in progress. Please initiate setup first.',
                'MFA_SETUP_NOT_FOUND',
                400,
            );
        }

        if (!$this->mfa->verifyTotp($provisionalSecret, $body->code)) {
            $this->logger->info('MFA enrollment verification failed [user_id={id}]', ['id' => (string) $user->getId()]);
            $this->auditService->log('user.mfa_enroll_failed', 'User', $user->getId(), $user, null, null, $request->getClientIp(), ['reason' => 'invalid_totp_code']);

            return AuthErrorResponses::simple('Invalid verification code', 'INVALID_MFA_CODE', 401);
        }

        $user->setMfaSecret($provisionalSecret);
        $user->setIsMfaEnabled(true);
        $this->em->flush();

        $this->setupCache->forget((string) $user->getId());

        $recoveryCodes = $this->mfa->generateRecoveryCodes($user);

        $this->logger->info('MFA enrollment completed [user_id={id}]', ['id' => (string) $user->getId()]);
        $this->auditService->log('user.mfa_enrolled', 'User', $user->getId(), $user, ['is_mfa_enabled' => false], ['is_mfa_enabled' => true], $request->getClientIp());

        $tokens = $this->tokenIssuer->issueForNewSession($user);

        return new JsonResponse([
            'message' => 'MFA enrolled successfully',
            'recovery_codes' => $recoveryCodes,
            'access' => $tokens['access'],
            'refresh' => $tokens['refresh'],
        ]);
    }
}
