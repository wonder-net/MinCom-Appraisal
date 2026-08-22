<?php

declare(strict_types=1);

namespace App\Service;

use Symfony\Component\HttpFoundation\File\UploadedFile;

/**
 * Validates a self-service employee photo upload (EmployeeMePhotoUploadController).
 * Unlike App\BulkImport\UploadedSpreadsheetValidator (extension-only — an
 * HR-admin-trusted upload), this decodes the file with getimagesize() to
 * confirm it's genuinely an image and to derive the extension from the
 * actual content rather than trusting the client-supplied filename, since
 * this endpoint is reachable by any authenticated employee uploading
 * their own picture.
 */
final class EmployeePhotoUploadValidator
{
    private const MAX_BYTES = 5 * 1024 * 1024;

    /**
     * @var array<string, string> image/mime => stored extension
     */
    private const ALLOWED_MIME_TYPES = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
    ];

    public function validate(?UploadedFile $file): EmployeePhotoValidation
    {
        if ($file === null) {
            return EmployeePhotoValidation::error('This field is required.');
        }

        // A real upload exceeding php.ini's upload_max_filesize arrives
        // with an empty path and this specific error code — getSize()
        // isn't reliable at that point, so check it first. Mirrors
        // AppraisalImportExcelController's identical guard.
        if ($file->getError() === \UPLOAD_ERR_INI_SIZE || $file->getSize() > self::MAX_BYTES) {
            return EmployeePhotoValidation::error(sprintf('File size exceeds the %d MB limit.', intdiv(self::MAX_BYTES, 1024 * 1024)));
        }

        $imageInfo = @getimagesize($file->getPathname());
        $mimeType = is_array($imageInfo) ? ($imageInfo['mime'] ?? null) : null;
        if ($mimeType === null || !isset(self::ALLOWED_MIME_TYPES[$mimeType])) {
            return EmployeePhotoValidation::error('Only JPG, PNG, and WEBP images are supported.');
        }

        return EmployeePhotoValidation::ok(self::ALLOWED_MIME_TYPES[$mimeType]);
    }
}
