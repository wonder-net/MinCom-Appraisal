<?php

declare(strict_types=1);

namespace App\AppraisalImport;

/**
 * Port of excel_parser.ParsedTrainingNeed.
 */
final class ParsedTrainingNeed
{
    public function __construct(
        public readonly string $type,
        public readonly string $description,
        public readonly ?string $courseTitle,
        public readonly ?string $institution,
        public readonly string $priority,
    ) {
    }
}
