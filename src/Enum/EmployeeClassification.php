<?php

declare(strict_types=1);

namespace App\Enum;

/**
 * Port of apps.employees.models.Employee.Classification: determines the
 * appraisal form type (Form A up to 17 competencies vs Form B up to 10).
 */
enum EmployeeClassification: string
{
    case MANAGERIAL = 'MANAGERIAL';
    case NON_MANAGERIAL = 'NON_MANAGERIAL';

    public function label(): string
    {
        return match ($this) {
            self::MANAGERIAL => 'Managerial',
            self::NON_MANAGERIAL => 'Non-Managerial',
        };
    }
}
