<?php

declare(strict_types=1);

namespace App\Entity;

use App\Enum\AppraisalPartyRole;
use App\Repository\CommentRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.appraisals.models.Comment. Append-only (no updatedAt) —
 * comments are never edited once created.
 *
 * `content` is encrypted at rest (AES-256-GCM, transparent via
 * App\Doctrine\Type\EncryptedStringType), matching Django's
 * EncryptedTextField.
 */
#[ORM\Entity(repositoryClass: CommentRepository::class)]
#[ORM\Table(name: 'appraisal_comment')]
class Comment
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    #[ORM\ManyToOne(targetEntity: Appraisal::class)]
    #[ORM\JoinColumn(name: 'appraisal_id', nullable: false, onDelete: 'CASCADE')]
    private Appraisal $appraisal;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'author_id', nullable: false)]
    private User $author;

    #[ORM\Column(type: 'string', length: 10, enumType: AppraisalPartyRole::class)]
    private AppraisalPartyRole $authorRole;

    #[ORM\Column(type: 'encrypted_string')]
    private string $content;

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    public function __construct(Appraisal $appraisal, User $author, AppraisalPartyRole $authorRole, string $content)
    {
        $this->id = Uuid::v7();
        $this->appraisal = $appraisal;
        $this->author = $author;
        $this->authorRole = $authorRole;
        $this->content = $content;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): Uuid
    {
        return $this->id;
    }

    public function getAppraisal(): Appraisal
    {
        return $this->appraisal;
    }

    public function getAuthor(): User
    {
        return $this->author;
    }

    public function getAuthorRole(): AppraisalPartyRole
    {
        return $this->authorRole;
    }

    public function getContent(): string
    {
        return $this->content;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }
}
