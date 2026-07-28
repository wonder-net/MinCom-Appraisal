<?php

declare(strict_types=1);

namespace App\AppraisalImport;

/**
 * Port of zip_utils.extract_xls_from_zip. Pure function — no Doctrine/
 * service dependencies. Extracts .xls/.xlsx entries from a zip archive.
 */
final class ZipExtractor
{
    public const MAX_ZIP_SIZE = 50 * 1024 * 1024;
    public const MAX_FILE_SIZE = 5 * 1024 * 1024;
    public const MAX_FILES = 500;

    /**
     * @return list<array{0: string, 1: string}> list of [filename, bytes]
     */
    public function extract(string $zipBytes): array
    {
        if (strlen($zipBytes) > self::MAX_ZIP_SIZE) {
            throw new ZipExtractionException(
                sprintf('Zip file exceeds the %d MB limit.', self::MAX_ZIP_SIZE / (1024 * 1024)),
                'ZIP_TOO_LARGE',
            );
        }

        $tempPath = tempnam(sys_get_temp_dir(), 'appraisal-zip-');
        if ($tempPath === false) {
            throw new ZipExtractionException('The uploaded file is not a valid zip archive.', 'INVALID_ZIP');
        }

        try {
            file_put_contents($tempPath, $zipBytes);

            $zip = new \ZipArchive();
            if ($zip->open($tempPath) !== true) {
                throw new ZipExtractionException('The uploaded file is not a valid zip archive.', 'INVALID_ZIP');
            }

            try {
                return $this->extractEligibleEntries($zip);
            } finally {
                $zip->close();
            }
        } finally {
            @unlink($tempPath);
        }
    }

    /**
     * @return list<array{0: string, 1: string}>
     */
    private function extractEligibleEntries(\ZipArchive $zip): array
    {
        $eligible = [];

        for ($i = 0; $i < $zip->numFiles; ++$i) {
            $stat = $zip->statIndex($i);
            if ($stat === false) {
                continue;
            }

            $name = $stat['name'];
            if (str_ends_with($name, '/')) {
                continue; // Directory entry.
            }
            if (str_contains($name, '__MACOSX')) {
                continue;
            }

            $basename = str_contains($name, '/') ? substr($name, strrpos($name, '/') + 1) : $name;
            if (str_starts_with($basename, '.')) {
                continue;
            }

            $lower = strtolower($basename);
            if (!str_ends_with($lower, '.xls') && !str_ends_with($lower, '.xlsx')) {
                continue;
            }

            $eligible[] = [$name, $basename, $stat['size']];
        }

        if (count($eligible) > self::MAX_FILES) {
            throw new ZipExtractionException(
                sprintf('Zip contains %d .xls files. Maximum is %d.', count($eligible), self::MAX_FILES),
                'TOO_MANY_FILES',
            );
        }

        $results = [];
        foreach ($eligible as [$name, $basename, $size]) {
            if ($size > self::MAX_FILE_SIZE) {
                throw new ZipExtractionException(
                    sprintf('File \'%s\' exceeds the %d MB limit.', $basename, self::MAX_FILE_SIZE / (1024 * 1024)),
                    'FILE_TOO_LARGE',
                );
            }

            $contents = $zip->getFromName($name);
            if ($contents === false) {
                continue;
            }

            $results[] = [$basename, $contents];
        }

        return $results;
    }
}
