<?php

declare(strict_types=1);

namespace App\Tests\Unit\EventListener;

use App\Entity\User;
use App\EventListener\PasswordChangeRequiredListener;
use App\Security\PasswordChangeRequiredException;
use PHPUnit\Framework\TestCase;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Event\ControllerEvent;
use Symfony\Component\HttpKernel\HttpKernelInterface;

final class PasswordChangeRequiredListenerTest extends TestCase
{
    private function makeEvent(string $path): ControllerEvent
    {
        $kernel = $this->createStub(HttpKernelInterface::class);

        return new ControllerEvent($kernel, static fn () => null, Request::create($path), HttpKernelInterface::MAIN_REQUEST);
    }

    public function testThrowsWhenPasswordNeverRotatedAndPathNotAllowlisted(): void
    {
        $user = new User('rookie@example.com');
        $security = $this->createStub(Security::class);
        $security->method('getUser')->willReturn($user);

        $listener = new PasswordChangeRequiredListener($security);

        $this->expectException(PasswordChangeRequiredException::class);
        $listener($this->makeEvent('/api/v1/employees/'));
    }

    public function testAllowsAllowlistedPathEvenWithoutRotation(): void
    {
        $user = new User('rookie@example.com');
        $security = $this->createStub(Security::class);
        $security->method('getUser')->willReturn($user);

        $listener = new PasswordChangeRequiredListener($security);

        $listener($this->makeEvent('/api/v1/auth/logout/'));
        $this->addToAssertionCount(1); // reached without throwing
    }

    public function testAllowsWhenPasswordAlreadyRotated(): void
    {
        $user = new User('veteran@example.com');
        $user->setLastPasswordChange(new \DateTimeImmutable('-1 day'));
        $security = $this->createStub(Security::class);
        $security->method('getUser')->willReturn($user);

        $listener = new PasswordChangeRequiredListener($security);

        $listener($this->makeEvent('/api/v1/employees/'));
        $this->addToAssertionCount(1);
    }

    public function testAllowsAnonymousRequests(): void
    {
        $security = $this->createStub(Security::class);
        $security->method('getUser')->willReturn(null);

        $listener = new PasswordChangeRequiredListener($security);

        $listener($this->makeEvent('/api/v1/employees/'));
        $this->addToAssertionCount(1);
    }
}
