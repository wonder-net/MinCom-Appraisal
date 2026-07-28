<?php

declare(strict_types=1);

namespace App\AppraisalImport;

/**
 * Port of employee_matching.MatchResult.
 */
final class MatchResult
{
    /**
     * @param list<MatchCandidate> $candidates
     */
    public function __construct(
        public readonly string $matchType,
        public readonly int $confidence,
        public readonly ?string $employeeId = null,
        public readonly ?string $employeeNumber = null,
        public readonly ?string $employeeName = null,
        public readonly array $candidates = [],
    ) {
    }
}
