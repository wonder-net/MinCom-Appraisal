<?php

declare(strict_types=1);

namespace App\AppraisalImport;

/**
 * Discriminated result of AppraisalImportExcelService::import(), one
 * per outcome branch of Django's import_excel_service/import_excel view
 * pairing. The controller maps `kind` to the exact status code/body
 * Django returns for each branch.
 */
final class ImportExcelOutcome
{
    private function __construct(
        public readonly string $kind,
        public readonly ?ImportSummary $summary = null,
        public readonly ?string $parseErrorCode = null,
    ) {
    }

    public static function success(ImportSummary $summary): self
    {
        return new self('success', $summary);
    }

    public static function notFound(): self
    {
        return new self('not_found');
    }

    public static function parseError(string $code): self
    {
        return new self('parse_error', null, $code);
    }

    public static function statusNotAllowed(): self
    {
        return new self('status_not_allowed');
    }
}
