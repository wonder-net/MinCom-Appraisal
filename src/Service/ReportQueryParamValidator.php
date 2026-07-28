<?php

declare(strict_types=1);

namespace App\Service;

use App\Enum\AppraisalFormType;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.reports.views.{_validate_department_id_param,
 * _validate_form_type_param} — shared by every 13b/13c/13d report
 * accepting these two query params.
 */
final class ReportQueryParamValidator
{
    /**
     * @return array{0: ?Uuid, 1: ?JsonResponse}
     */
    public function validateDepartmentId(?string $raw): array
    {
        if ($raw === null) {
            return [null, null];
        }

        if (!Uuid::isValid($raw)) {
            return [null, new JsonResponse(['detail' => 'Invalid department_id.'], 400)];
        }

        return [Uuid::fromString($raw), null];
    }

    /**
     * @return array{0: ?AppraisalFormType, 1: ?JsonResponse}
     */
    public function validateFormType(?string $raw): array
    {
        if ($raw === null) {
            return [null, null];
        }

        $formType = AppraisalFormType::tryFrom($raw);
        if ($formType === null) {
            return [null, new JsonResponse(['detail' => 'Invalid form_type. Must be FORM_A or FORM_B.'], 400)];
        }

        return [$formType, null];
    }
}
