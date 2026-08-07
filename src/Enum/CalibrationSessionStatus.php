<?php

declare(strict_types=1);

namespace App\Enum;

/**
 * Calibration (product roadmap item, not one of the 11 original HR
 * change requests — see the "9-box first, calibration second" roadmap
 * conversation). One CalibrationSession per (cycle, department) pair;
 * PENDING until HR explicitly marks it COMPLETE, which is what
 * CalibrationService::isComplete() gates on before allowing any
 * SIGNED_OFF appraisal in that department to reach FINALISED — see
 * CalibrationSession's docblock for why this exists as a real
 * workflow gate, not just an advisory report.
 */
enum CalibrationSessionStatus: string
{
    case PENDING = 'PENDING';
    case COMPLETE = 'COMPLETE';
}
