<?php

declare(strict_types=1);

namespace App\AppraisalImport;

/**
 * Port of excel_parser.ParsedKD.
 */
final class ParsedKd
{
    public function __construct(
        public readonly string $perspectiveName,
        public readonly string $description,
        public readonly string $weight,
        public readonly ?string $managerRating,
        public readonly ?string $selfRating,
        public readonly int $sortOrder,
    ) {
    }
}
