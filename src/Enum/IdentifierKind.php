<?php

declare(strict_types=1);

namespace App\Enum;

enum IdentifierKind: string
{
    case EMAIL = 'email';
    case EMPLOYEE_NUMBER = 'employee_number';
    case NOT_FOUND = 'not_found';
}
