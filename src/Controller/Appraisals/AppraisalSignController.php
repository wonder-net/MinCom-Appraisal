<?php

declare(strict_types=1);

namespace App\Controller\Appraisals;

use App\Entity\User;
use App\Enum\SignatureAction;
use App\Exception\DuplicateSignatureException;
use App\Exception\OptimisticLockException;
use App\Exception\SignPermissionException;
use App\Exception\TransitionException;
use App\Repository\AppraisalRepository;
use App\Service\SignAppraisalService;
use App\Service\SignatureSignResponseBuilder;
use App\Validation\ValidationErrorFactory;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Port of AppraisalViewSet.sign(). Only the appraisee and their manager
 * can sign — HR Admin cannot sign on behalf of others. Creates a
 * Signature; if both parties have now ACCEPTed, auto-transitions to
 * SIGNED_OFF; REJECT/COMMENTS_ATTACHED auto-transitions to DISPUTED.
 */
final class AppraisalSignController
{
    public function __construct(
        private readonly AppraisalRepository $appraisals,
        private readonly SignAppraisalService $signAppraisal,
        private readonly SignatureSignResponseBuilder $responseBuilder,
    ) {
    }

    #[Route('/api/v1/appraisals/{id}/sign/', name: 'appraisals_sign', methods: ['POST'], requirements: ['id' => '[0-9a-fA-F-]{36}'])]
    public function __invoke(string $id, Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $payload = json_decode($request->getContent(), true) ?? [];

        $errors = [];
        $action = null;
        if (!isset($payload['action']) || !is_string($payload['action'])) {
            $errors['action'] = 'This field is required.';
        } else {
            $action = SignatureAction::tryFrom($payload['action']);
            if ($action === null) {
                $errors['action'] = sprintf('"%s" is not a valid choice.', $payload['action']);
            }
        }

        $discussed = (bool) ($payload['discussed'] ?? false);
        $reason = isset($payload['reason']) && is_string($payload['reason']) && trim($payload['reason']) !== ''
            ? $payload['reason']
            : null;

        if ($action !== null && in_array($action, [SignatureAction::REJECT, SignatureAction::COMMENTS_ATTACHED], true) && $reason === null) {
            $errors['reason'] = 'This field is required when action is REJECT or COMMENTS_ATTACHED.';
        }

        if ($errors !== []) {
            throw ValidationErrorFactory::fields($errors);
        }

        $appraisalCheck = $this->appraisals->findById($id);
        if ($appraisalCheck === null) {
            throw new NotFoundHttpException();
        }

        $ipAddress = trim(explode(',', $request->headers->get('X-Forwarded-For', '') ?: $request->server->get('REMOTE_ADDR', ''))[0]);
        $userAgentHash = hash('sha256', $request->headers->get('User-Agent', ''));

        try {
            $signature = $this->signAppraisal->sign($id, $user, $action, $discussed, $reason, $ipAddress, $userAgentHash);
        } catch (SignPermissionException $exc) {
            return new JsonResponse(['detail' => $exc->getMessage()], 403);
        } catch (DuplicateSignatureException $exc) {
            return new JsonResponse(['code' => 'ALREADY_SIGNED', 'message' => $exc->getMessage()], 409);
        } catch (TransitionException $exc) {
            return new JsonResponse(['detail' => $exc->getMessage(), 'code' => $exc->transitionCode], 400);
        } catch (OptimisticLockException $exc) {
            return new JsonResponse(['detail' => $exc->getMessage()], 409);
        }

        if ($signature === null) {
            throw new NotFoundHttpException();
        }

        return new JsonResponse($this->responseBuilder->build($signature), 201);
    }
}
