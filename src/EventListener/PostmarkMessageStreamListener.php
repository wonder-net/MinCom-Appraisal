<?php

declare(strict_types=1);

namespace App\EventListener;

use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\Mailer\Event\MessageEvent;
use Symfony\Component\Mime\Email;

/**
 * Port of utils.email_backends.PostmarkEmailBackend: injects the
 * X-PM-Message-Stream header into every outgoing message so Postmark
 * routes it to the correct stream. Django's version is a custom SMTP
 * backend subclass that only runs in production (PostmarkEmailBackend
 * is the prod-only EMAIL_BACKEND); this listener runs unconditionally
 * in every environment instead, since the header is inert noise to any
 * non-Postmark transport (mailpit, null://null) — simpler than gating
 * on which transport is configured, with no behavioural difference.
 */
final class PostmarkMessageStreamListener
{
    public function __construct(private readonly string $postmarkMessageStream)
    {
    }

    #[AsEventListener(event: MessageEvent::class)]
    public function onMessage(MessageEvent $event): void
    {
        $message = $event->getMessage();
        if (!$message instanceof Email) {
            return;
        }

        if (!$message->getHeaders()->has('X-PM-Message-Stream')) {
            $message->getHeaders()->addTextHeader('X-PM-Message-Stream', $this->postmarkMessageStream);
        }
    }
}
