<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Employee;
use Symfony\Component\HttpFoundation\File\UploadedFile;

/**
 * Local-disk storage for self-service employee photo uploads
 * (EmployeeMePhotoUploadController / EmployeeMePhotoDeleteController).
 * Writes into the same `app.employee_photo_dir` EasyAdmin's ImageField
 * uses for HR-admin uploads (EmployeeCrudController), so both paths
 * produce a filename EmployeeResponseBuilder::photoUrl() can serve
 * identically regardless of who uploaded it.
 *
 * Filenames are deterministic — `{employeeId}.{extension}` — rather than
 * preserving the original upload name: there's exactly one photo per
 * employee, so a stable name means a re-upload simply overwrites in
 * place instead of accumulating orphaned files, and needs no
 * collision-avoidance scheme the way HR's bulk-named uploads would.
 */
final class EmployeePhotoStorage
{
    public function __construct(private readonly string $employeePhotoDir)
    {
    }

    public function store(UploadedFile $file, Employee $employee, string $extension): string
    {
        if (!is_dir($this->employeePhotoDir)) {
            mkdir($this->employeePhotoDir, 0775, true);
        }

        $previousFilename = $employee->getPhotoFilename();
        $filename = sprintf('%s.%s', $employee->getId(), $extension);

        // Delete the previous file first when the extension changes
        // (e.g. png -> jpg): the new filename won't overwrite it, so
        // without this it would just orphan on disk forever.
        if ($previousFilename !== null && $previousFilename !== $filename) {
            $this->delete($previousFilename);
        }

        $file->move($this->employeePhotoDir, $filename);

        return $filename;
    }

    public function delete(?string $filename): void
    {
        if ($filename === null || $filename === '') {
            return;
        }

        $path = rtrim($this->employeePhotoDir, '/').'/'.$filename;
        if (is_file($path)) {
            @unlink($path);
        }
    }
}
