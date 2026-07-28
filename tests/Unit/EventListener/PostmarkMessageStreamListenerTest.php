<?php

declare(strict_types=1);

namespace App\Tests\Unit\EventListener;

use App\EventListener\PostmarkMessageStreamListener;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Mailer\Envelope;
use Symfony\Component\Mailer\Event\MessageEvent;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;
use Symfony\Component\Mime\RawMessage;

final class PostmarkMessageStreamListenerTest extends TestCase
{
    public function testAddsMessageStreamHeaderToEmail(): void
    {
        $listener = new PostmarkMessageStreamListener('outbound');
        $email = (new Email())->from('noreply@mincom.com')->to('user@example.com')->subject('Test')->text('Body');
        $event = new MessageEvent($email, new Envelope(new Address('noreply@mincom.com'), [new Address('user@example.com')]), 'smtp');

        $listener->onMessage($event);

        self::assertSame('outbound', $email->getHeaders()->get('X-PM-Message-Stream')?->getBodyAsString());
    }

    public function testDoesNotOverwriteAnExplicitlySetStream(): void
    {
        $listener = new PostmarkMessageStreamListener('outbound');
        $email = (new Email())->from('noreply@mincom.com')->to('user@example.com')->subject('Test')->text('Body');
        $email->getHeaders()->addTextHeader('X-PM-Message-Stream', 'broadcast');
        $event = new MessageEvent($email, new Envelope(new Address('noreply@mincom.com'), [new Address('user@example.com')]), 'smtp');

        $listener->onMessage($event);

        self::assertSame('broadcast', $email->getHeaders()->get('X-PM-Message-Stream')?->getBodyAsString());
    }

    public function testIgnoresNonEmailRawMessages(): void
    {
        $listener = new PostmarkMessageStreamListener('outbound');
        $message = new RawMessage('not a real email');
        $event = new MessageEvent($message, new Envelope(new Address('noreply@mincom.com'), [new Address('user@example.com')]), 'smtp');

        $listener->onMessage($event);

        // No exception — reaching this line is the assertion.
        $this->addToAssertionCount(1);
    }
}
