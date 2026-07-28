<?php

declare(strict_types=1);

namespace App\Enum;

/**
 * Port of apps.competencies.models.Competency.ApplicableTo: which employee
 * classification(s) a competency applies to (ALL appears on both Form A
 * and Form B; MANAGERIAL/NON_MANAGERIAL are form-specific).
 */
enum CompetencyApplicableTo: string
{
    case ALL = 'ALL';
    case MANAGERIAL = 'MANAGERIAL';
    case NON_MANAGERIAL = 'NON_MANAGERIAL';
}
