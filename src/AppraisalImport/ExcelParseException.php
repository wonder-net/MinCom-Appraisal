<?php

declare(strict_types=1);

namespace App\AppraisalImport;

/**
 * Port of excel_parser.ExcelParseError.
 */
final class ExcelParseException extends \RuntimeException
{
    public const INVALID_TEMPLATE = 'INVALID_TEMPLATE';
    public const PARSE_ERROR = 'PARSE_ERROR';

    public function __construct(string $message, public readonly string $errorCode)
    {
        parent::__construct($message);
    }
}
