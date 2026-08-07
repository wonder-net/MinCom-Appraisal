<?php

declare(strict_types=1);

namespace App\Service;

/**
 * HR change request #2: embeds an employee's uploaded profile picture as
 * a base64 data URI for the appraisal PDF report, same rationale as
 * PdfLogo (avoids dompdf filesystem/URL resolution issues) but keyed by
 * a per-employee filename rather than a single fixed path.
 */
final class EmployeePhotoLoader
{
    public function __construct(private readonly string $employeePhotoDir)
    {
    }

    public function base64DataUri(?string $photoFilename): ?string
    {
        if ($photoFilename === null || $photoFilename === '') {
            return null;
        }

        $path = rtrim($this->employeePhotoDir, '/').'/'.$photoFilename;
        if (!is_file($path)) {
            return null;
        }

        $contents = file_get_contents($path);
        if ($contents === false) {
            return null;
        }

        $mimeType = match (strtolower(pathinfo($photoFilename, PATHINFO_EXTENSION))) {
            'png' => 'image/png',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            default => 'image/jpeg',
        };

        return sprintf('data:%s;base64,%s', $mimeType, base64_encode($contents));
    }
}
