<?php

declare(strict_types=1);

namespace App\Enum;

/**
 * Port of apps.appraisals.models.Appraisal.FormType, auto-derived from
 * the employee's classification (see AppraisalInstanceBuilder).
 */
enum AppraisalFormType: string
{
    case FORM_A = 'FORM_A';
    case FORM_B = 'FORM_B';
}
