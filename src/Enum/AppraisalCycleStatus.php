<?php

declare(strict_types=1);

namespace App\Enum;

/**
 * Port of apps.appraisals.models.AppraisalCycle.Status.
 */
enum AppraisalCycleStatus: string
{
    case DRAFT = 'DRAFT';
    case ACTIVE = 'ACTIVE';
    case CLOSED = 'CLOSED';
    case ARCHIVED = 'ARCHIVED';
}
