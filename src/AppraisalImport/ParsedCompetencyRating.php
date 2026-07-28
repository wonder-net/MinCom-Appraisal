<?php

declare(strict_types=1);

namespace App\AppraisalImport;

/**
 * Port of excel_parser.ParsedCompetencyRating.
 */
final class ParsedCompetencyRating
{
    public function __construct(
        public readonly string $competencyName,
        public readonly ?string $managerRating,
        public readonly ?string $selfRating,
    ) {
    }
}
