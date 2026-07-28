<?php

declare(strict_types=1);

namespace App\BulkImport;

/**
 * Port of apps.accounts.bulk_import_parser.BulkImportParseError.
 */
final class BulkImportParseException extends \RuntimeException
{
    public function __construct(private readonly string $userMessage, private readonly string $errorCode = 'PARSE_ERROR')
    {
        parent::__construct($userMessage);
    }

    public function getUserMessage(): string
    {
        return $this->userMessage;
    }

    public function getErrorCode(): string
    {
        return $this->errorCode;
    }
}
