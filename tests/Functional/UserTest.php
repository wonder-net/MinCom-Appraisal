<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Entity\User;
use App\Enum\RoleName;
use App\Factory\UserFactory;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

final class UserTest extends KernelTestCase
{
    public function testUserPersistsWithHashedPasswordAndRoles(): void
    {
        self::bootKernel();
        $container = static::getContainer();

        /** @var EntityManagerInterface $em */
        $em = $container->get(EntityManagerInterface::class);

        $user = UserFactory::new()->withRoles(RoleName::HR_ADMIN)->create();
        $em->clear();

        /** @var UserRepository $repository */
        $repository = $container->get(UserRepository::class);
        $persisted = $repository->findOneByEmail($user->getEmail());

        $this->assertNotNull($persisted);
        $this->assertNotSame(UserFactory::DEFAULT_PASSWORD, $persisted->getPassword());

        /** @var UserPasswordHasherInterface $hasher */
        $hasher = $container->get(UserPasswordHasherInterface::class);
        $this->assertTrue($hasher->isPasswordValid($persisted, UserFactory::DEFAULT_PASSWORD));

        $this->assertTrue($persisted->hasAdminRole());
        $this->assertTrue($persisted->hasRole(RoleName::HR_ADMIN));
        $this->assertFalse($persisted->hasRole(RoleName::EMPLOYEE));
        $this->assertSame(['ROLE_HR_ADMIN', 'ROLE_USER'], $persisted->getRoles());
    }

    public function testSoftDeleteDeactivatesInsteadOfRemoving(): void
    {
        self::bootKernel();
        $container = static::getContainer();

        /** @var EntityManagerInterface $em */
        $em = $container->get(EntityManagerInterface::class);

        $user = UserFactory::new()->create();
        $this->assertTrue($user->isActive());

        $user->deactivate();
        $em->flush();
        $em->clear();

        /** @var UserRepository $repository */
        $repository = $container->get(UserRepository::class);
        $persisted = $repository->findOneByEmail($user->getEmail());

        $this->assertNotNull($persisted);
        $this->assertFalse($persisted->isActive());
    }

    public function testHrAdminAndSystemAdminShareAdminPermissionSurface(): void
    {
        self::bootKernel();

        $hrAdmin = UserFactory::new()->withRoles(RoleName::HR_ADMIN)->create();
        $systemAdmin = UserFactory::new()->withRoles(RoleName::SYSTEM_ADMIN)->create();
        $employee = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();

        $this->assertTrue($hrAdmin->hasAdminRole());
        $this->assertTrue($systemAdmin->hasAdminRole());
        $this->assertFalse($employee->hasAdminRole());
    }
}
