<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Entity\User;
use App\Exception\ConflictException;
use App\Repository\UserRepository;
use App\Security\Voter\RoleHierarchyVoter;
use App\Service\EmailService;
use App\Service\TempPasswordGenerator;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.accounts.views.AdminResendInvitationView.
 */
#[IsGranted(RoleHierarchyVoter::IS_ADMIN)]
final class AdminResendInvitationController
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly TempPasswordGenerator $tempPasswordGenerator,
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger,
        private readonly EmailService $emailService,
        private readonly string $frontendUrl,
    ) {
    }

    #[Route('/api/v1/admin/users/{id}/resend-invitation/', name: 'admin_users_resend_invitation', methods: ['POST'])]
    public function __invoke(string $id, #[CurrentUser] User $admin): JsonResponse
    {
        if (!Uuid::isValid($id)) {
            throw new NotFoundHttpException();
        }

        $user = $this->users->find(Uuid::fromString($id));
        if ($user === null) {
            throw new NotFoundHttpException();
        }

        if ($user->getLastPasswordChange() !== null) {
            throw new ConflictException('User has already set their own password.', 'INVITATION_ALREADY_USED');
        }

        $tempPassword = $this->tempPasswordGenerator->generate();
        $user->setPassword($this->passwordHasher->hashPassword($user, $tempPassword));
        $this->em->flush();

        $loginUrl = rtrim($this->frontendUrl, '/').'/login';
        $this->emailService->sendWelcomeAccount($user->getEmail(), $user->getFullName() ?? $user->getEmail(), $tempPassword, $loginUrl);
        $this->logger->info('Invitation resent [user_id={id}, actor={actor}]', [
            'id' => (string) $user->getId(),
            'actor' => (string) $admin->getId(),
        ]);

        return new JsonResponse(['message' => 'Invitation email resent.']);
    }
}
