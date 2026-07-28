<?php

declare(strict_types=1);

namespace App\AppraisalImport;

/**
 * Port of employee_matching.MatchCandidate.
 */
final class MatchCandidate
{
    public function __construct(
        public readonly string $employeeId,
        public readonly string $employeeNumber,
        public readonly string $name,
        public readonly string $department,
        public readonly string $jobTitle,
        public readonly int $score,
    ) {
    }
}
