<?php

declare(strict_types=1);

namespace App\AppraisalImport;

/**
 * Port of zip_utils.ZipExtractionError.
 */
final class ZipExtractionException extends \RuntimeException
{
    public function __construct(string $message, public readonly string $errorCode = 'ZIP_ERROR')
    {
        parent::__construct($message);
    }
}
