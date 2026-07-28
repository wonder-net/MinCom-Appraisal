<?php

declare(strict_types=1);

namespace App\Controller\Auth;

use App\Dto\Auth\PasswordConfirmationRequest;
use App\Entity\User;
use App\Repository\RecoveryCodeRepository;
use App\Service\AuditService;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of apps.accounts.views.MFADisableView.
 */
final class MfaDisableController
{
    public function __construct(
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly RecoveryCodeRepository $recoveryCodes,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
        private readonly AuditService $auditService,
    ) {
    }

    #[Route('/api/v1/auth/mfa/disable/', name: 'auth_mfa_disable', methods: ['POST'])]
    public function __invoke(Request $request, #[MapRequestPayload] PasswordConfirmationRequest $body, #[CurrentUser] User $user): JsonResponse
    {
        if (!$user->isMfaEnabled()) {
            return AuthErrorResponses::simple('MFA is not enabled.', 'MFA_NOT_ENABLED', 400);
        }

        if (!$this->passwordHasher->isPasswordValid($user, $body->password)) {
            return AuthErrorResponses::simple('Invalid password.', 'INVALID_PASSWORD', 400);
        }

        $user->setIsMfaEnabled(false);
        $user->setMfaSecret(null);
        $this->em->flush();

        $this->recoveryCodes->deleteAllForUser($user);

        $this->logger->info('MFA disabled [user_id={id}]', ['id' => (string) $user->getId()]);
        $this->auditService->log('user.mfa_disabled', 'User', $user->getId(), $user, ['is_mfa_enabled' => true], ['is_mfa_enabled' => false], $request->getClientIp());

        return new JsonResponse(['message' => 'MFA disabled successfully']);
    }
}
