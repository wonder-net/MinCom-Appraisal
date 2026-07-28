<?php

declare(strict_types=1);

namespace App\AppraisalImport;

/**
 * Port of excel_parser.ParsedCareerPlan.
 */
final class ParsedCareerPlan
{
    public function __construct(
        public readonly string $aspiredRole,
        public readonly string $priority,
    ) {
    }
}
