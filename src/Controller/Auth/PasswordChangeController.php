<?php

declare(strict_types=1);

namespace App\Controller\Auth;

use App\Dto\Auth\PasswordChangeRequest;
use App\Entity\User;
use App\Service\AuditService;
use App\Service\TokenService;
use App\Validation\ValidationErrorFactory;
use App\Validator\PasswordPolicy;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Validator\Validator\ValidatorInterface;

/**
 * Port of apps.accounts.views.PasswordChangeView. Checks run in the exact
 * order Django's PasswordChangeSerializer.validate() does: old-password
 * correctness, same-password rejection, confirm-match, THEN the complexity
 * validators (see PasswordChangeRequest's docblock for why the policy check
 * is manual here rather than a DTO attribute).
 */
final class PasswordChangeController
{
    public function __construct(
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly ValidatorInterface $validator,
        private readonly EntityManagerInterface $em,
        private readonly TokenService $tokenService,
        private readonly LoggerInterface $logger,
        private readonly AuditService $auditService,
    ) {
    }

    #[Route('/api/v1/auth/password/change/', name: 'auth_password_change', methods: ['POST'])]
    public function __invoke(Request $request, #[MapRequestPayload] PasswordChangeRequest $body, #[CurrentUser] User $user): JsonResponse
    {
        if (!$this->passwordHasher->isPasswordValid($user, $body->oldPassword)) {
            throw ValidationErrorFactory::field('old_password', 'Old password is incorrect.');
        }

        if ($body->newPassword === $body->oldPassword) {
            throw ValidationErrorFactory::field('new_password', 'New password must be different from the old password.');
        }

        if ($body->newPassword !== $body->confirmPassword) {
            throw ValidationErrorFactory::field('confirm_password', 'New password and confirmation do not match.');
        }

        $violations = $this->validator->validate($body->newPassword, new PasswordPolicy());
        if (count($violations) > 0) {
            $messages = array_map(static fn ($v): string => (string) $v->getMessage(), iterator_to_array($violations));
            throw ValidationErrorFactory::manyForField('new_password', $messages);
        }

        $user->setPassword($this->passwordHasher->hashPassword($user, $body->newPassword));
        $user->setLastPasswordChange(new \DateTimeImmutable());
        $this->em->flush();

        $this->tokenService->revokeAllForUser($user);

        $this->logger->info('Password changed successfully [user_id={id}]', ['id' => (string) $user->getId()]);
        $this->auditService->log('user.password_changed', 'User', $user->getId(), $user, null, null, $request->getClientIp(), ['email' => $user->getEmail()]);

        return new JsonResponse(['message' => 'Password changed successfully']);
    }
}
