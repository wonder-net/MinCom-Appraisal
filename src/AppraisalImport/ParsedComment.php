<?php

declare(strict_types=1);

namespace App\AppraisalImport;

/**
 * Port of excel_parser.ParsedComment.
 */
final class ParsedComment
{
    public function __construct(
        public readonly string $authorRole,
        public readonly string $content,
    ) {
    }
}
