<?php

declare(strict_types=1);

namespace App\Command;

use App\Entity\User;
use App\Repository\UserRepository;
use App\Service\AuditService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * Port of apps.accounts.management.commands.bootstrap_superuser.
 *
 * Investigative-only design, exactly as in Django (see that module's
 * docstring, quoted here since the rationale doesn't change in the
 * port): the account this creates is deliberately "naked" — no
 * Employee profile, no HR_ADMIN/SYSTEM_ADMIN role, just
 * User::isSuperuser() (ROLE_SUPERUSER). It exists solely so an
 * operator/consultant can reach `/admin` (this port's
 * `/django-admin/` equivalent) for ops/debugging. It cannot use any
 * business-RBAC-gated endpoint — a user with no HR_ADMIN/SYSTEM_ADMIN
 * role hits the same access_control/IS_ADMIN-voter denial any other
 * roleless user would. It's invisible to every report (all
 * Employee/Appraisal-anchored, never User-anchored) and to the
 * SPA's admin-create-user-derived user listings that filter on
 * having an Employee profile. Do not "fix" any of this — see Django's
 * original docstring for why it's intentional.
 *
 * Idempotent: re-running when the named user already has isSuperuser,
 * isStaff, and isActive all true makes no database writes. Promoting
 * an existing user never touches their password — only creation sets
 * one.
 */
#[AsCommand(name: 'app:bootstrap-superuser', description: 'Create or promote a narrow, investigative-only /admin superuser')]
final class BootstrapSuperuserCommand extends Command
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly EntityManagerInterface $em,
        private readonly AuditService $auditService,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('email', null, InputOption::VALUE_REQUIRED, 'Superuser email')
            ->addOption('password', null, InputOption::VALUE_REQUIRED, 'Superuser password (only used when creating a new user — an existing user\'s password is never touched)');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        $email = $input->getOption('email');
        $password = $input->getOption('password');

        if (!is_string($email) || $email === '') {
            $io->error('--email is required.');

            return Command::FAILURE;
        }

        $user = $this->users->findOneByEmail($email);
        $created = $user === null;

        if ($user !== null && $user->isSuperuser() && $user->isStaff() && $user->isActive()) {
            $io->warning('Superuser already configured. Skipping.');

            return Command::SUCCESS;
        }

        if ($created) {
            if (!is_string($password) || $password === '') {
                $io->error('--password is required when creating a new user.');

                return Command::FAILURE;
            }

            $user = new User($email);
            $user->setPassword($this->passwordHasher->hashPassword($user, $password));
            $user->setIsSuperuser(true);
            $user->setIsStaff(true);
            $this->em->persist($user);
        } else {
            \assert($user instanceof User);
            // Promote without touching the password — mirrors Django's
            // _promote_existing_user(), which saves via update_fields
            // that deliberately exclude "password".
            $user->setIsSuperuser(true);
            $user->setIsStaff(true);
            if (!$user->isActive()) {
                $user->setIsActive(true);
            }
        }

        $this->em->flush();

        $this->auditService->log(
            action: 'user.granted_superuser',
            resourceType: 'User',
            resourceId: $user->getId(),
            newState: [
                'email' => $email,
                'is_superuser' => true,
                'is_staff' => true,
                'is_active' => true,
            ],
            metadata: [
                'source' => 'bootstrap_superuser',
                'created' => $created,
            ],
        );

        $io->success(sprintf('%s superuser: %s.', $created ? 'Created' : 'Promoted', $email));

        return Command::SUCCESS;
    }
}
