<?php

declare(strict_types=1);

namespace App\AppraisalImport;

/**
 * Port of excel_parser.ParsedStrengthWeakness.
 */
final class ParsedStrengthWeakness
{
    public function __construct(
        public readonly string $type,
        public readonly string $description,
    ) {
    }
}
