<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Comment;
use App\Repository\EmployeeRepository;

/**
 * Port of apps.appraisals.serializers.CommentSerializer.
 */
final class CommentResponseBuilder
{
    public function __construct(private readonly EmployeeRepository $employees)
    {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(Comment $comment): array
    {
        $author = $comment->getAuthor();
        $profile = $this->employees->findByUser($author);

        return [
            'id' => (string) $comment->getId(),
            'appraisal_id' => (string) $comment->getAppraisal()->getId(),
            'author_id' => (string) $author->getId(),
            'author_name' => $profile !== null ? $profile->getName() : $author->getEmail(),
            'author_role' => $comment->getAuthorRole()->value,
            'content' => $comment->getContent(),
            'created_at' => $comment->getCreatedAt()->format(\DateTimeInterface::ATOM),
        ];
    }
}
