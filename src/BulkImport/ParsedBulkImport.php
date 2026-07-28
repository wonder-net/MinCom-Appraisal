<?php

declare(strict_types=1);

namespace App\BulkImport;

/**
 * Port of apps.accounts.bulk_import_parser.ParsedBulkImport.
 */
final class ParsedBulkImport
{
    /**
     * @param list<ParsedEmployeeRow> $rows
     * @param list<string> $parseWarnings
     */
    public function __construct(
        public readonly array $rows = [],
        public readonly array $parseWarnings = [],
    ) {
    }
}
