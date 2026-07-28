<?php

declare(strict_types=1);

namespace App\Tests\Functional\Auth;

use App\Enum\RoleName;
use App\Factory\EmployeeFactory;
use App\Factory\RoleFactory;
use App\Factory\UserFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class AuthFlowTest extends WebTestCase
{
    public function testLoginSuccessReturnsTokensAndUserInfo(): void
    {
        $client = static::createClient();
        $user = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();

        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => $user->getEmail(),
            'password' => UserFactory::DEFAULT_PASSWORD,
        ]));

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true);

        self::assertSame('success', $body['status']);
        self::assertNotEmpty($body['data']['access']);
        self::assertNotEmpty($body['data']['refresh']);
        self::assertSame($user->getEmail(), $body['data']['user']['email']);
        self::assertSame(['EMPLOYEE'], $body['data']['user']['roles']);
        self::assertFalse($body['data']['user']['is_mfa_enabled']);
        self::assertNull($body['data']['user']['employee_id']);
        self::assertTrue($body['data']['must_change_password']);
        self::assertSame([], $body['meta']);
    }

    public function testLoginReturnsLinkedEmployeeId(): void
    {
        $client = static::createClient();
        $employee = EmployeeFactory::new()->create(['employeeNumber' => 'EMP-55001']);
        $employee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => $employee->getUser()->getEmail(),
            'password' => UserFactory::DEFAULT_PASSWORD,
        ]));

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame((string) $employee->getId(), $body['user']['employee_id']);
    }

    public function testLoginWithEmployeeNumberIdentifierSucceeds(): void
    {
        $client = static::createClient();
        $employee = EmployeeFactory::new()->create(['employeeNumber' => 'EMP-55002']);
        $employee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        // Deliberately mixed case + separators, must normalise to "EMP55002".
        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => 'emp-55002',
            'password' => UserFactory::DEFAULT_PASSWORD,
        ]));

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame($employee->getUser()->getEmail(), $body['user']['email']);
        self::assertSame((string) $employee->getId(), $body['user']['employee_id']);
    }

    public function testLoginWithUnknownEmployeeNumberReturnsSameGenericFailure(): void
    {
        $client = static::createClient();

        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => 'EMP-99999',
            'password' => 'whatever123',
        ]));

        self::assertResponseStatusCodeSame(401);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertSame('AUTHENTICATION_FAILED', $body['data']['code']);
    }

    public function testLoginWithWrongPasswordReturnsGenericAuthFailure(): void
    {
        $client = static::createClient();
        $user = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();

        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => $user->getEmail(),
            'password' => 'definitely-wrong',
        ]));

        self::assertResponseStatusCodeSame(401);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertSame('error', $body['status']);
        self::assertSame('AUTHENTICATION_FAILED', $body['data']['code']);
        self::assertSame('Invalid credentials. Please try again.', $body['data']['message']);
        self::assertSame([], $body['data']['errors']);
        self::assertNotEmpty($body['data']['correlation_id']);
    }

    public function testLoginWithUnknownIdentifierReturnsSameGenericFailure(): void
    {
        $client = static::createClient();

        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => 'nobody@example.com',
            'password' => 'whatever123',
        ]));

        self::assertResponseStatusCodeSame(401);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertSame('AUTHENTICATION_FAILED', $body['data']['code']);
        self::assertSame('Invalid credentials. Please try again.', $body['data']['message']);
    }

    public function testLoginWithNoRolesIsForbidden(): void
    {
        $client = static::createClient();
        $user = UserFactory::new()->create(); // no roles assigned

        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => $user->getEmail(),
            'password' => UserFactory::DEFAULT_PASSWORD,
        ]));

        self::assertResponseStatusCodeSame(403);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertSame('NO_SPA_ROLES_ASSIGNED', $body['data']['code']);
        self::assertArrayNotHasKey('errors', $body['data']);
        self::assertArrayNotHasKey('correlation_id', $body['data']);
    }

    public function testProtectedRouteWithoutBearerTokenReturnsStandardEnvelope(): void
    {
        $client = static::createClient();

        $client->request('POST', '/api/v1/auth/logout/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode(['refresh' => 'whatever']));

        self::assertResponseStatusCodeSame(401);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertSame('error', $body['status']);
        self::assertSame('AUTHENTICATION_FAILED', $body['data']['code']);
        self::assertSame('Authentication credentials were not provided or are invalid.', $body['data']['message']);
    }

    public function testFullLoginRefreshLogoutFlow(): void
    {
        $client = static::createClient();
        $user = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();

        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => $user->getEmail(),
            'password' => UserFactory::DEFAULT_PASSWORD,
        ]));
        $login = json_decode($client->getResponse()->getContent(), true)['data'];

        // --- refresh ---
        $client->request('POST', '/api/v1/auth/token/refresh/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'refresh' => $login['refresh'],
        ]));
        self::assertResponseIsSuccessful();
        $refreshed = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertNotEmpty($refreshed['access']);
        self::assertNotEmpty($refreshed['refresh']);
        self::assertNotSame($login['refresh'], $refreshed['refresh'], 'refresh token must rotate');

        // --- old refresh token is now consumed (single_use) ---
        $client->request('POST', '/api/v1/auth/token/refresh/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'refresh' => $login['refresh'],
        ]));
        self::assertResponseStatusCodeSame(401);

        // --- logout with the rotated refresh token, authenticated via the new access token ---
        $client->request(
            'POST',
            '/api/v1/auth/logout/',
            server: [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_AUTHORIZATION' => 'Bearer '.$refreshed['access'],
            ],
            content: json_encode(['refresh' => $refreshed['refresh']]),
        );
        self::assertResponseIsSuccessful();
        $logoutBody = json_decode($client->getResponse()->getContent(), true);
        self::assertSame('Successfully logged out.', $logoutBody['data']['message']);

        // --- the just-logged-out refresh token can no longer be used ---
        $client->request('POST', '/api/v1/auth/token/refresh/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'refresh' => $refreshed['refresh'],
        ]));
        self::assertResponseStatusCodeSame(401);
    }
}
