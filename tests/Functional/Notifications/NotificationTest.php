<?php

declare(strict_types=1);

namespace App\Tests\Functional\Notifications;

use App\Entity\Notification;
use App\Entity\User;
use App\Enum\RoleName;
use App\Factory\UserFactory;
use App\Repository\NotificationRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.notifications.tests.test_views's core coverage: list
 * scoping, unread-count caching, mark-read ownership (404 vs 403), and
 * mark-all-read bulk behaviour.
 */
final class NotificationTest extends WebTestCase
{
    public function testListReturnsOnlyOwnNotifications(): void
    {
        $client = static::createClient();
        $user = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        $other = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->persist(new Notification($user, null, 'status.changed', 'Title', 'Mine'));
        $em->persist(new Notification($other, null, 'status.changed', 'Title', 'Not mine'));
        $em->flush();

        [$client, $token] = $this->login($user, $client);
        $client->request('GET', '/api/v1/notifications/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertCount(1, $body);
        self::assertSame('Mine', $body[0]['message']);
    }

    public function testListOrdersNewestFirst(): void
    {
        $client = static::createClient();
        $user = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $first = new Notification($user, null, 'status.changed', 'Title', 'First');
        $em->persist($first);
        $em->flush();
        $second = new Notification($user, null, 'status.changed', 'Title', 'Second');
        $em->persist($second);
        $em->flush();

        [$client, $token] = $this->login($user, $client);
        $client->request('GET', '/api/v1/notifications/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame(['Second', 'First'], array_column($body, 'message'));
    }

    public function testUnreadCountReflectsUnreadOnly(): void
    {
        $client = static::createClient();
        $user = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $unread = new Notification($user, null, 'status.changed', 'Title', 'Unread');
        $read = new Notification($user, null, 'status.changed', 'Title', 'Read');
        $read->markRead();
        $em->persist($unread);
        $em->persist($read);
        $em->flush();

        [$client, $token] = $this->login($user, $client);
        $client->request('GET', '/api/v1/notifications/unread-count/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame(1, $body['unread_count']);
    }

    public function testMarkReadIsIdempotentAndBustsUnreadCount(): void
    {
        $client = static::createClient();
        $user = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $notification = new Notification($user, null, 'status.changed', 'Title', 'Body');
        $em->persist($notification);
        $em->flush();
        $notificationId = (string) $notification->getId();

        [$client, $token] = $this->login($user, $client);

        $client->request('GET', '/api/v1/notifications/unread-count/', server: $this->authHeader($token));
        self::assertSame(1, json_decode($client->getResponse()->getContent(), true)['data']['unread_count']);

        $client->request('PATCH', '/api/v1/notifications/'.$notificationId.'/read/', server: $this->authHeader($token));
        self::assertResponseStatusCodeSame(200);
        self::assertTrue(json_decode($client->getResponse()->getContent(), true)['data']['is_read']);

        $client->request('GET', '/api/v1/notifications/unread-count/', server: $this->authHeader($token));
        self::assertSame(0, json_decode($client->getResponse()->getContent(), true)['data']['unread_count']);

        // Idempotent: marking an already-read notification again is a no-op 200.
        $client->request('PATCH', '/api/v1/notifications/'.$notificationId.'/read/', server: $this->authHeader($token));
        self::assertResponseStatusCodeSame(200);
    }

    public function testMarkReadReturns404ForNonexistentNotification(): void
    {
        $client = static::createClient();
        $user = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $token] = $this->login($user, $client);
        $client->request('PATCH', '/api/v1/notifications/'.Uuid::v7().'/read/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(404);
    }

    public function testMarkReadReturns403ForSomeoneElsesNotification(): void
    {
        $client = static::createClient();
        $owner = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        $intruder = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $notification = new Notification($owner, null, 'status.changed', 'Title', 'Body');
        $em->persist($notification);
        $em->flush();

        [$client, $token] = $this->login($intruder, $client);
        $client->request('PATCH', '/api/v1/notifications/'.$notification->getId().'/read/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(403);
    }

    public function testMarkAllReadFlipsOnlyOwnUnreadNotifications(): void
    {
        $client = static::createClient();
        $user = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        $other = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->persist(new Notification($user, null, 'status.changed', 'Title', 'A'));
        $em->persist(new Notification($user, null, 'status.changed', 'Title', 'B'));
        $em->persist(new Notification($other, null, 'status.changed', 'Title', 'C'));
        $em->flush();

        [$client, $token] = $this->login($user, $client);
        $client->request('POST', '/api/v1/notifications/mark-all-read/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame(2, $body['marked_count']);

        /** @var NotificationRepository $notifications */
        $notifications = static::getContainer()->get(NotificationRepository::class);
        $freshOther = $em->getRepository(User::class)->find($other->getId());
        \assert($freshOther instanceof User);
        self::assertSame(1, $notifications->countUnreadByRecipient($freshOther));
    }

    /**
     * @return array{0: KernelBrowser, 1: string}
     */
    private function login(User $user, KernelBrowser $client): array
    {
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $freshUser = $em->getRepository(User::class)->find($user->getId());
        \assert($freshUser instanceof User);
        $freshUser->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        $em->flush();

        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => $freshUser->getEmail(),
            'password' => UserFactory::DEFAULT_PASSWORD,
        ]));
        $login = json_decode($client->getResponse()->getContent(), true)['data'];

        return [$client, $login['access']];
    }

    /**
     * @return array<string, string>
     */
    private function authHeader(string $accessToken): array
    {
        return ['CONTENT_TYPE' => 'application/json', 'HTTP_AUTHORIZATION' => 'Bearer '.$accessToken];
    }
}
