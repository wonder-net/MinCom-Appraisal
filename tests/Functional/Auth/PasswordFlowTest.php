<?php

declare(strict_types=1);

namespace App\Tests\Functional\Auth;

use App\Entity\PasswordResetToken;
use App\Enum\RoleName;
use App\Factory\UserFactory;
use App\Service\PasswordResetTokenService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class PasswordFlowTest extends WebTestCase
{
    private const STRONG_PASSWORD = 'Xk7$mQ9zTronDoor!42';

    public function testChangePasswordSuccessRevokesOldTokens(): void
    {
        $client = static::createClient();
        $user = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        // Rotation already done, so the PasswordChangeRequired gate never
        // fires — this test targets the change endpoint itself, not the gate.
        $user->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => $user->getEmail(),
            'password' => UserFactory::DEFAULT_PASSWORD,
        ]));
        $login = json_decode($client->getResponse()->getContent(), true)['data'];

        $client->request('POST', '/api/v1/auth/password/change/', server: [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_AUTHORIZATION' => 'Bearer '.$login['access'],
        ], content: json_encode([
            'old_password' => UserFactory::DEFAULT_PASSWORD,
            'new_password' => self::STRONG_PASSWORD,
            'confirm_password' => self::STRONG_PASSWORD,
        ]));

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertSame('Password changed successfully', $body['data']['message']);

        // Old refresh token must be revoked as part of the password change.
        $client->request('POST', '/api/v1/auth/token/refresh/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'refresh' => $login['refresh'],
        ]));
        self::assertResponseStatusCodeSame(401);

        // New password actually works for a fresh login.
        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => $user->getEmail(),
            'password' => self::STRONG_PASSWORD,
        ]));
        self::assertResponseIsSuccessful();
    }

    public function testChangePasswordWrongOldPasswordReturnsFieldError(): void
    {
        [$client, $accessToken] = $this->loginRotatedUser();

        $client->request('POST', '/api/v1/auth/password/change/', server: [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_AUTHORIZATION' => 'Bearer '.$accessToken,
        ], content: json_encode([
            'old_password' => 'not-the-real-password',
            'new_password' => self::STRONG_PASSWORD,
            'confirm_password' => self::STRONG_PASSWORD,
        ]));

        self::assertResponseStatusCodeSame(400);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertSame('VALIDATION_ERROR', $body['data']['code']);
        self::assertSame('old_password', $body['data']['errors'][0]['field']);
        self::assertSame('Old password is incorrect.', $body['data']['errors'][0]['message']);
    }

    public function testChangePasswordSameAsOldIsRejected(): void
    {
        [$client, $accessToken] = $this->loginRotatedUser();

        $client->request('POST', '/api/v1/auth/password/change/', server: [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_AUTHORIZATION' => 'Bearer '.$accessToken,
        ], content: json_encode([
            'old_password' => UserFactory::DEFAULT_PASSWORD,
            'new_password' => UserFactory::DEFAULT_PASSWORD,
            'confirm_password' => UserFactory::DEFAULT_PASSWORD,
        ]));

        self::assertResponseStatusCodeSame(400);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertSame('new_password', $body['data']['errors'][0]['field']);
        self::assertSame('New password must be different from the old password.', $body['data']['errors'][0]['message']);
    }

    public function testChangePasswordConfirmMismatch(): void
    {
        [$client, $accessToken] = $this->loginRotatedUser();

        $client->request('POST', '/api/v1/auth/password/change/', server: [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_AUTHORIZATION' => 'Bearer '.$accessToken,
        ], content: json_encode([
            'old_password' => UserFactory::DEFAULT_PASSWORD,
            'new_password' => self::STRONG_PASSWORD,
            'confirm_password' => self::STRONG_PASSWORD.'x',
        ]));

        self::assertResponseStatusCodeSame(400);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertSame('confirm_password', $body['data']['errors'][0]['field']);
    }

    public function testChangePasswordWeakPolicyAggregatesEveryViolation(): void
    {
        [$client, $accessToken] = $this->loginRotatedUser();

        $client->request('POST', '/api/v1/auth/password/change/', server: [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_AUTHORIZATION' => 'Bearer '.$accessToken,
        ], content: json_encode([
            'old_password' => UserFactory::DEFAULT_PASSWORD,
            'new_password' => 'weakweak',
            'confirm_password' => 'weakweak',
        ]));

        self::assertResponseStatusCodeSame(400);
        $body = json_decode($client->getResponse()->getContent(), true);
        $messages = array_column($body['data']['errors'], 'message');
        self::assertContains('Your password must contain at least one special character (e.g., ! @ # $ % ^ & *).', $messages);
        self::assertContains('Your password must contain at least one uppercase letter.', $messages);
        foreach ($body['data']['errors'] as $error) {
            self::assertSame('new_password', $error['field']);
        }
    }

    public function testPasswordResetRequestReturnsGenericMessageRegardless(): void
    {
        $client = static::createClient();
        $user = UserFactory::new()->create();

        $client->request('POST', '/api/v1/auth/password/reset/request/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'email' => $user->getEmail(),
        ]));
        self::assertResponseIsSuccessful();
        $known = json_decode($client->getResponse()->getContent(), true);

        $client->request('POST', '/api/v1/auth/password/reset/request/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'email' => 'no-such-user@example.com',
        ]));
        self::assertResponseIsSuccessful();
        $unknown = json_decode($client->getResponse()->getContent(), true);

        self::assertSame($known['data']['message'], $unknown['data']['message']);
    }

    public function testPasswordResetConfirmSuccess(): void
    {
        $client = static::createClient();
        $user = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $tokenService = static::getContainer()->get(PasswordResetTokenService::class);

        $plaintext = $tokenService->generateToken();
        $now = new \DateTimeImmutable();
        $em->persist(new PasswordResetToken($user, $tokenService->hashToken($plaintext), $tokenService->computeExpiry($now)));
        $em->flush();

        $client->request('POST', '/api/v1/auth/password/reset/confirm/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'token' => $plaintext,
            'new_password' => self::STRONG_PASSWORD,
            'new_password_confirm' => self::STRONG_PASSWORD,
        ]));

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertSame('Password has been reset successfully.', $body['data']['message']);

        // The token is single-use.
        $client->request('POST', '/api/v1/auth/password/reset/confirm/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'token' => $plaintext,
            'new_password' => self::STRONG_PASSWORD,
            'new_password_confirm' => self::STRONG_PASSWORD,
        ]));
        self::assertResponseStatusCodeSame(400);
        $replay = json_decode($client->getResponse()->getContent(), true);
        self::assertSame('INVALID_TOKEN', $replay['data']['code']);

        // New password actually works for a fresh login.
        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => $user->getEmail(),
            'password' => self::STRONG_PASSWORD,
        ]));
        self::assertResponseIsSuccessful();
    }

    public function testPasswordResetConfirmExpiredTokenIsRejected(): void
    {
        $client = static::createClient();
        $user = UserFactory::new()->create();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $tokenService = static::getContainer()->get(PasswordResetTokenService::class);

        $plaintext = $tokenService->generateToken();
        $expiredAt = (new \DateTimeImmutable())->modify('-1 minute');
        $em->persist(new PasswordResetToken($user, $tokenService->hashToken($plaintext), $expiredAt));
        $em->flush();

        $client->request('POST', '/api/v1/auth/password/reset/confirm/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'token' => $plaintext,
            'new_password' => self::STRONG_PASSWORD,
            'new_password_confirm' => self::STRONG_PASSWORD,
        ]));

        self::assertResponseStatusCodeSame(400);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertSame('INVALID_TOKEN', $body['data']['code']);
    }

    public function testPasswordResetConfirmUnknownTokenIsRejected(): void
    {
        $client = static::createClient();

        $client->request('POST', '/api/v1/auth/password/reset/confirm/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'token' => str_repeat('a', 64),
            'new_password' => self::STRONG_PASSWORD,
            'new_password_confirm' => self::STRONG_PASSWORD,
        ]));

        self::assertResponseStatusCodeSame(400);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertSame('INVALID_TOKEN', $body['data']['code']);
    }

    public function testPasswordResetConfirmMismatchedConfirmation(): void
    {
        $client = static::createClient();

        $client->request('POST', '/api/v1/auth/password/reset/confirm/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'token' => str_repeat('a', 64),
            'new_password' => self::STRONG_PASSWORD,
            'new_password_confirm' => self::STRONG_PASSWORD.'x',
        ]));

        self::assertResponseStatusCodeSame(400);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertSame('new_password_confirm', $body['data']['errors'][0]['field']);
        self::assertSame('Passwords do not match.', $body['data']['errors'][0]['message']);
    }

    /**
     * @return array{0: \Symfony\Bundle\FrameworkBundle\KernelBrowser, 1: string}
     */
    private function loginRotatedUser(): array
    {
        $client = static::createClient();
        $user = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        $user->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => $user->getEmail(),
            'password' => UserFactory::DEFAULT_PASSWORD,
        ]));
        $login = json_decode($client->getResponse()->getContent(), true)['data'];

        return [$client, $login['access']];
    }
}
