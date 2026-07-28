<?php

declare(strict_types=1);

namespace App\BulkImport;

/**
 * Local-disk storage for uploaded bulk-import files between the
 * validate/create step and the (Messenger) processing step — mirrors
 * Django's MEDIA_ROOT/bulk-imports directory and UserBulkImportJob's
 * FileField.
 */
final class BulkImportFileStorage
{
    public function __construct(private readonly string $bulkImportStorageDir)
    {
    }

    public function store(string $bytes, string $jobId, string $extension): string
    {
        if (!is_dir($this->bulkImportStorageDir)) {
            mkdir($this->bulkImportStorageDir, 0775, true);
        }

        $path = rtrim($this->bulkImportStorageDir, '/').'/'.$jobId.$extension;
        file_put_contents($path, $bytes);

        return $path;
    }

    public function read(string $path): string
    {
        $contents = file_get_contents($path);
        if ($contents === false) {
            throw new \RuntimeException(sprintf('Could not read stored bulk-import file at "%s".', $path));
        }

        return $contents;
    }

    public function delete(string $path): void
    {
        if ($path !== '' && is_file($path)) {
            @unlink($path);
        }
    }

    /**
     * Stores under a job-id-named subdirectory with the ORIGINAL
     * filename preserved as the basename — mirrors Django's
     * `MEDIA_ROOT/appraisal_imports/{job_id}/{original_filename}`
     * layout, used by the appraisal bulk-import flow where a
     * single-file (non-zip) upload's `confirmed_matches` mapping is
     * keyed by the original filename and must survive round-tripping
     * through disk between the validate and confirm steps.
     */
    public function storePreservingName(string $bytes, string $jobId, string $originalName): string
    {
        $jobDir = rtrim($this->bulkImportStorageDir, '/').'/'.$jobId;
        if (!is_dir($jobDir)) {
            mkdir($jobDir, 0775, true);
        }

        $path = $jobDir.'/'.basename($originalName);
        file_put_contents($path, $bytes);

        return $path;
    }

    /**
     * Deletes the file and its parent job directory — mirrors Django's
     * `shutil.rmtree(job_dir)` cleanup for the storePreservingName()
     * layout above.
     */
    public function deleteJobDirectory(string $filePath): void
    {
        if ($filePath === '') {
            return;
        }

        $dir = dirname($filePath);
        if (is_dir($dir)) {
            $this->removeDirectoryRecursively($dir);
        } elseif (is_file($filePath)) {
            @unlink($filePath);
        }
    }

    private function removeDirectoryRecursively(string $dir): void
    {
        foreach (scandir($dir) ?: [] as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $path = $dir.'/'.$item;
            if (is_dir($path)) {
                $this->removeDirectoryRecursively($path);
            } else {
                @unlink($path);
            }
        }
        @rmdir($dir);
    }
}
