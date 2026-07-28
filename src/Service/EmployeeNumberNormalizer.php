<?php

declare(strict_types=1);

namespace App\Service;

/**
 * Port of apps.employees.services.normalize_employee_number. Also invoked
 * from the Employee entity's setter for the same reason Django calls it
 * from Employee.save() — canonical storage form regardless of how the
 * value was entered (API, bulk import).
 */
final class EmployeeNumberNormalizer
{
    public static function normalize(string $raw): string
    {
        return strtoupper(str_replace([' ', '-'], '', trim($raw)));
    }
}
