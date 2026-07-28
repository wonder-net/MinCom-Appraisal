<?php

declare(strict_types=1);

namespace App\Tests\Functional\Auth;

use App\Enum\RoleName;
use App\Factory\UserFactory;
use Doctrine\ORM\EntityManagerInterface;
use OTPHP\TOTP;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class MfaFlowTest extends WebTestCase
{
    public function testMfaEnrollmentFlow(): void
    {
        [$client, $accessToken] = $this->loginRotatedUser();

        $client->request('POST', '/api/v1/auth/mfa/setup/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $setup = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertNotEmpty($setup['secret']);
        self::assertStringStartsWith('otpauth://totp/', $setup['provisioning_uri']);

        $code = TOTP::createFromSecret($setup['secret'])->now();

        $client->request('POST', '/api/v1/auth/mfa/verify/', server: $this->authHeader($accessToken), content: json_encode(['code' => $code]));
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('MFA enrolled successfully', $body['message']);
        self::assertCount(10, $body['recovery_codes']);
        self::assertNotEmpty($body['access']);
        self::assertNotEmpty($body['refresh']);
    }

    public function testMfaSetupWhenAlreadyEnabledIsRejected(): void
    {
        [$client, $accessToken] = $this->enrollMfa();

        $client->request('POST', '/api/v1/auth/mfa/setup/', server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(400);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertSame('MFA_ALREADY_ENABLED', $body['data']['code']);
    }

    public function testMfaVerifyWithoutSetupInProgress(): void
    {
        [$client, $accessToken] = $this->loginRotatedUser();

        $client->request('POST', '/api/v1/auth/mfa/verify/', server: $this->authHeader($accessToken), content: json_encode(['code' => '123456']));
        self::assertResponseStatusCodeSame(400);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertSame('MFA_SETUP_NOT_FOUND', $body['data']['code']);
    }

    public function testMfaVerifyWithWrongCodeIsRejected(): void
    {
        [$client, $accessToken] = $this->loginRotatedUser();

        $client->request('POST', '/api/v1/auth/mfa/setup/', server: $this->authHeader($accessToken));
        $client->request('POST', '/api/v1/auth/mfa/verify/', server: $this->authHeader($accessToken), content: json_encode(['code' => '000000']));

        self::assertResponseStatusCodeSame(401);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertSame('INVALID_MFA_CODE', $body['data']['code']);
    }

    public function testLoginWithMfaEnabledReturnsChallenge(): void
    {
        [$client, , $email] = $this->enrollMfa();

        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => $email,
            'password' => UserFactory::DEFAULT_PASSWORD,
        ]));

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertTrue($body['mfa_required']);
        self::assertNotEmpty($body['mfa_token']);
        self::assertArrayNotHasKey('access', $body);
    }

    public function testMfaVerifyLoginWithValidTotpCode(): void
    {
        [$client, , $email, $secret] = $this->enrollMfa();
        $mfaToken = $this->requestMfaChallenge($client, $email);

        $client->request('POST', '/api/v1/auth/mfa/verify-login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'mfa_token' => $mfaToken,
            'code' => TOTP::createFromSecret($secret)->now(),
        ]));

        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertNotEmpty($body['access']);
        self::assertNotEmpty($body['refresh']);
        self::assertSame($email, $body['user']['email']);
        self::assertArrayNotHasKey('mfa_setup_required', $body);
    }

    public function testMfaVerifyLoginWithRecoveryCodeIsSingleUse(): void
    {
        [$client, , $email, , $recoveryCodes] = $this->enrollMfa();
        $recoveryCode = $recoveryCodes[0];

        $mfaToken = $this->requestMfaChallenge($client, $email);
        $client->request('POST', '/api/v1/auth/mfa/verify-login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'mfa_token' => $mfaToken,
            'recovery_code' => $recoveryCode,
        ]));
        self::assertResponseIsSuccessful();

        // Same recovery code cannot be reused against a fresh challenge.
        $mfaToken2 = $this->requestMfaChallenge($client, $email);
        $client->request('POST', '/api/v1/auth/mfa/verify-login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'mfa_token' => $mfaToken2,
            'recovery_code' => $recoveryCode,
        ]));
        self::assertResponseStatusCodeSame(401);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertSame('INVALID_MFA_CODE', $body['data']['code']);
    }

    public function testMfaVerifyLoginLocksAfterMaxAttempts(): void
    {
        [$client, , $email] = $this->enrollMfa();
        $mfaToken = $this->requestMfaChallenge($client, $email);

        for ($i = 0; $i < 3; ++$i) {
            $client->request('POST', '/api/v1/auth/mfa/verify-login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
                'mfa_token' => $mfaToken,
                'code' => '000000',
            ]));
            self::assertResponseStatusCodeSame(401);
            self::assertSame('INVALID_MFA_CODE', json_decode($client->getResponse()->getContent(), true)['data']['code']);
        }

        // 4th attempt: token already invalidated by the 3rd failure.
        $client->request('POST', '/api/v1/auth/mfa/verify-login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'mfa_token' => $mfaToken,
            'code' => '000000',
        ]));
        self::assertResponseStatusCodeSame(401);
        self::assertSame('MFA_TOKEN_EXPIRED', json_decode($client->getResponse()->getContent(), true)['data']['code']);
    }

    public function testMfaVerifyLoginRequiresExactlyOneOfCodeOrRecoveryCode(): void
    {
        [$client, , $email] = $this->enrollMfa();

        $mfaToken = $this->requestMfaChallenge($client, $email);
        $client->request('POST', '/api/v1/auth/mfa/verify-login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode(['mfa_token' => $mfaToken]));
        self::assertResponseStatusCodeSame(400);
        self::assertSame("Either 'code' or 'recovery_code' must be provided.", json_decode($client->getResponse()->getContent(), true)['data']['errors'][0]['message']);

        $mfaToken2 = $this->requestMfaChallenge($client, $email);
        $client->request('POST', '/api/v1/auth/mfa/verify-login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'mfa_token' => $mfaToken2,
            'code' => '123456',
            'recovery_code' => 'AAAA-BBBB-CCCC',
        ]));
        self::assertResponseStatusCodeSame(400);
        self::assertSame("Provide either 'code' or 'recovery_code', not both.", json_decode($client->getResponse()->getContent(), true)['data']['errors'][0]['message']);
    }

    public function testMfaDisableRequiresCorrectPassword(): void
    {
        [$client, $accessToken] = $this->enrollMfa();

        $client->request('POST', '/api/v1/auth/mfa/disable/', server: $this->authHeader($accessToken), content: json_encode(['password' => 'wrong']));
        self::assertResponseStatusCodeSame(400);
        self::assertSame('INVALID_PASSWORD', json_decode($client->getResponse()->getContent(), true)['data']['code']);

        $client->request('POST', '/api/v1/auth/mfa/disable/', server: $this->authHeader($accessToken), content: json_encode(['password' => UserFactory::DEFAULT_PASSWORD]));
        self::assertResponseIsSuccessful();
        self::assertSame('MFA disabled successfully', json_decode($client->getResponse()->getContent(), true)['data']['message']);

        $client->request('POST', '/api/v1/auth/mfa/disable/', server: $this->authHeader($accessToken), content: json_encode(['password' => UserFactory::DEFAULT_PASSWORD]));
        self::assertResponseStatusCodeSame(400);
        self::assertSame('MFA_NOT_ENABLED', json_decode($client->getResponse()->getContent(), true)['data']['code']);
    }

    public function testMfaStatusReflectsEnabledStateAndRecoveryCodeCount(): void
    {
        [$client, $accessToken] = $this->enrollMfa();

        $client->request('GET', '/api/v1/auth/mfa/status/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertTrue($body['is_mfa_enabled']);
        self::assertSame(10, $body['recovery_codes_remaining']);
    }

    public function testRegenerateRecoveryCodesInvalidatesOldOnes(): void
    {
        [$client, $accessToken, $email, , $recoveryCodes] = $this->enrollMfa();

        $client->request('POST', '/api/v1/auth/mfa/recovery-codes/regenerate/', server: $this->authHeader($accessToken), content: json_encode(['password' => UserFactory::DEFAULT_PASSWORD]));
        self::assertResponseIsSuccessful();
        $newCodes = json_decode($client->getResponse()->getContent(), true)['data']['recovery_codes'];
        self::assertCount(10, $newCodes);
        self::assertNotSame($recoveryCodes, $newCodes);

        // Old code no longer works.
        $mfaToken = $this->requestMfaChallenge($client, $email);
        $client->request('POST', '/api/v1/auth/mfa/verify-login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'mfa_token' => $mfaToken,
            'recovery_code' => $recoveryCodes[0],
        ]));
        self::assertResponseStatusCodeSame(401);

        // New code works.
        $mfaToken2 = $this->requestMfaChallenge($client, $email);
        $client->request('POST', '/api/v1/auth/mfa/verify-login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'mfa_token' => $mfaToken2,
            'recovery_code' => $newCodes[0],
        ]));
        self::assertResponseIsSuccessful();
    }

    /**
     * @return array{0: KernelBrowser, 1: string, 2: string}
     */
    private function loginRotatedUserWithEmail(): array
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

        return [$client, $login['access'], $user->getEmail()];
    }

    /**
     * @return array{0: KernelBrowser, 1: string}
     */
    private function loginRotatedUser(): array
    {
        [$client, $accessToken] = $this->loginRotatedUserWithEmail();

        return [$client, $accessToken];
    }

    /**
     * Logs in, completes MFA enrollment, and returns everything a test
     * might need: the client (still authenticated with the enrollment
     * access token), that access token, the user's email, the TOTP secret,
     * and the 10 plaintext recovery codes.
     *
     * @return array{0: KernelBrowser, 1: string, 2: string, 3: string, 4: list<string>}
     */
    private function enrollMfa(): array
    {
        [$client, $accessToken, $email] = $this->loginRotatedUserWithEmail();

        $client->request('POST', '/api/v1/auth/mfa/setup/', server: $this->authHeader($accessToken));
        $setup = json_decode($client->getResponse()->getContent(), true)['data'];
        $secret = $setup['secret'];

        $client->request('POST', '/api/v1/auth/mfa/verify/', server: $this->authHeader($accessToken), content: json_encode([
            'code' => TOTP::createFromSecret($secret)->now(),
        ]));
        $verify = json_decode($client->getResponse()->getContent(), true)['data'];

        return [$client, $accessToken, $email, $secret, $verify['recovery_codes']];
    }

    private function requestMfaChallenge(KernelBrowser $client, string $email): string
    {
        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => $email,
            'password' => UserFactory::DEFAULT_PASSWORD,
        ]));

        return json_decode($client->getResponse()->getContent(), true)['data']['mfa_token'];
    }

    /**
     * @return array<string, string>
     */
    private function authHeader(string $accessToken): array
    {
        return ['CONTENT_TYPE' => 'application/json', 'HTTP_AUTHORIZATION' => 'Bearer '.$accessToken];
    }
}
