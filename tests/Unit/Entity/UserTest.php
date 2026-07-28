<?php

declare(strict_types=1);

namespace App\Tests\Unit\Entity;

use App\Entity\Role;
use App\Entity\User;
use App\Enum\RoleName;
use PHPUnit\Framework\TestCase;

final class UserTest extends TestCase
{
    public function testGetRolesIncludesRoleUserOnlyByDefault(): void
    {
        $user = new User('plain@example.com');

        self::assertSame(['ROLE_USER'], $user->getRoles());
    }

    public function testGetRolesAddsRoleSuperuserWhenFlagSet(): void
    {
        $user = new User('super@example.com');
        $user->setIsSuperuser(true);

        self::assertContains('ROLE_SUPERUSER', $user->getRoles());
        self::assertContains('ROLE_USER', $user->getRoles());
    }

    public function testSuperuserFlagDoesNotImplyAnyBusinessRole(): void
    {
        $user = new User('super@example.com');
        $user->setIsSuperuser(true);

        self::assertNotContains('ROLE_HR_ADMIN', $user->getRoles());
        self::assertNotContains('ROLE_SYSTEM_ADMIN', $user->getRoles());
        self::assertFalse($user->hasAdminRole());
    }

    public function testBusinessRoleDoesNotImplyRoleSuperuser(): void
    {
        $user = new User('admin@example.com');
        $user->addRole(new Role(RoleName::SYSTEM_ADMIN));

        self::assertNotContains('ROLE_SUPERUSER', $user->getRoles());
        self::assertTrue($user->hasAdminRole());
    }
}
