<?php

declare(strict_types=1);

namespace App\AppraisalImport;

/**
 * Port of excel_parser.ParsedDevelopmentNeed.
 */
final class ParsedDevelopmentNeed
{
    public function __construct(
        public readonly string $description,
        public readonly string $priority,
    ) {
    }
}
