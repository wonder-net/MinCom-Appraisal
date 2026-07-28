<?php

declare(strict_types=1);

namespace App\Controller\Appraisals;

use App\Entity\Comment;
use App\Entity\User;
use App\Enum\AppraisalPartyRole;
use App\Enum\AppraisalStatus;
use App\Repository\AppraisalRepository;
use App\Service\AppraisalAccessChecker;
use App\Service\CommentResponseBuilder;
use App\Validation\ValidationErrorFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of CommentViewSet.create(). Author and author_role are set
 * server-side: derived from the requester's relationship to the
 * appraisal, except an unrelated HR Admin, who must supply author_role
 * explicitly in the body.
 */
final class CommentCreateController
{
    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly AppraisalAccessChecker $access,
        private readonly CommentResponseBuilder $responseBuilder,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/v1/appraisals/{appraisalId}/comments/', name: 'appraisal_comments_create', methods: ['POST'], requirements: ['appraisalId' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $appraisalId, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $appraisal = $this->appraisals->findById($appraisalId);
        if ($appraisal === null) {
            throw new NotFoundHttpException();
        }

        if (!$this->access->userCanWriteComment($user, $appraisal)) {
            return new JsonResponse(['detail' => 'You do not have permission to perform this action.'], 403);
        }

        $isHrAdmin = $user->hasAdminRole();
        if ($this->access->isTerminalStatus($appraisal->getStatus())
            && !($isHrAdmin && $appraisal->getStatus() === AppraisalStatus::SIGNED_OFF)
        ) {
            return new JsonResponse(['detail' => 'Comments cannot be added to this appraisal.'], 403);
        }

        $authorRole = $this->access->deriveAuthorRole($user, $appraisal);
        $needsExplicitRole = $authorRole === null && $isHrAdmin;

        if ($authorRole === null && !$isHrAdmin) {
            return new JsonResponse(['detail' => 'You do not have permission to perform this action.'], 403);
        }

        $payload = json_decode($request->getContent(), true) ?? [];
        $errors = [];

        $content = is_string($payload['content'] ?? null) ? $payload['content'] : '';
        if (trim($content) === '') {
            $errors['content'] = 'Comment content must not be blank.';
        }

        if ($needsExplicitRole) {
            $explicitRole = is_string($payload['author_role'] ?? null) ? AppraisalPartyRole::tryFrom($payload['author_role']) : null;
            if ($explicitRole === null) {
                $errors['author_role'] = 'This field is required for HR Admin users.';
            } else {
                $authorRole = $explicitRole;
            }
        }

        if ($errors !== []) {
            throw ValidationErrorFactory::fields($errors);
        }

        $comment = new Comment($appraisal, $user, $authorRole, $content);
        $this->em->persist($comment);
        $this->em->flush();

        return new JsonResponse($this->responseBuilder->build($comment), 201);
    }
}
