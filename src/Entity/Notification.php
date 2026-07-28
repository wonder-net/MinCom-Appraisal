<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\NotificationRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.notifications.models.Notification. Immutable except for
 * `isRead` (toggled by the mark-read/mark-all-read endpoints) — every
 * other field is set once at creation via NotificationService::create().
 *
 * `event_type` is stored as a plain string (not a Doctrine enum column):
 * Django's own `NotificationType` choices are a soft, growable set
 * (accounts/appraisals call sites pass raw string literals, never the
 * enum object — see NotificationService's docblock), and one value
 * (`growth_plan.completed`) is defined but never actually dispatched.
 * Enforcing a strict enum here would add a constraint Django itself
 * doesn't have.
 */
#[ORM\Entity(repositoryClass: NotificationRepository::class)]
#[ORM\Table(name: 'notification')]
#[ORM\Index(name: 'idx_notif_recipient_created', columns: ['recipient_id', 'created_at'])]
#[ORM\Index(name: 'idx_notif_recipient_unread', columns: ['recipient_id', 'is_read'])]
class Notification
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'recipient_id', nullable: false, onDelete: 'CASCADE')]
    private User $recipient;

    #[ORM\ManyToOne(targetEntity: Appraisal::class)]
    #[ORM\JoinColumn(name: 'appraisal_id', nullable: true, onDelete: 'SET NULL')]
    private ?Appraisal $appraisal;

    #[ORM\Column(type: 'string', length: 100)]
    private string $eventType;

    #[ORM\Column(type: 'string', length: 255)]
    private string $title;

    #[ORM\Column(type: 'text')]
    private string $message;

    #[ORM\Column(type: 'boolean')]
    private bool $isRead = false;

    #[ORM\Column(type: 'string', length: 50)]
    private string $relatedObjectType = '';

    #[ORM\Column(type: 'uuid', nullable: true)]
    private ?Uuid $relatedObjectId = null;

    /**
     * @var array<string, mixed>
     */
    #[ORM\Column(type: 'json')]
    private array $metadata = [];

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    public function __construct(User $recipient, ?Appraisal $appraisal, string $eventType, string $title, string $message)
    {
        $this->id = Uuid::v7();
        $this->recipient = $recipient;
        $this->appraisal = $appraisal;
        $this->eventType = $eventType;
        $this->title = $title;
        $this->message = $message;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid
    {
        return $this->id;
    }

    public function getRecipient(): User
    {
        return $this->recipient;
    }

    public function getAppraisal(): ?Appraisal
    {
        return $this->appraisal;
    }

    public function getEventType(): string
    {
        return $this->eventType;
    }

    public function getTitle(): string
    {
        return $this->title;
    }

    public function getMessage(): string
    {
        return $this->message;
    }

    public function isRead(): bool
    {
        return $this->isRead;
    }

    public function markRead(): void
    {
        $this->isRead = true;
    }

    public function getRelatedObjectType(): string
    {
        return $this->relatedObjectType;
    }

    public function setRelatedObjectType(string $relatedObjectType): void
    {
        $this->relatedObjectType = $relatedObjectType;
    }

    public function getRelatedObjectId(): ?Uuid
    {
        return $this->relatedObjectId;
    }

    public function setRelatedObjectId(?Uuid $relatedObjectId): void
    {
        $this->relatedObjectId = $relatedObjectId;
    }

    /**
     * @return array<string, mixed>
     */
    public function getMetadata(): array
    {
        return $this->metadata;
    }

    /**
     * @param array<string, mixed> $metadata
     */
    public function setMetadata(array $metadata): void
    {
        $this->metadata = $metadata;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }
}
