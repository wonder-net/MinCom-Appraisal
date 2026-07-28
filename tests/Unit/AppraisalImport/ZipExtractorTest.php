<?php

declare(strict_types=1);

namespace App\Tests\Unit\AppraisalImport;

use App\AppraisalImport\ZipExtractionException;
use App\AppraisalImport\ZipExtractor;
use PHPUnit\Framework\TestCase;

final class ZipExtractorTest extends TestCase
{
    private function buildZip(array $entries): string
    {
        $tempPath = tempnam(sys_get_temp_dir(), 'zip-extractor-test-').'.zip';
        $zip = new \ZipArchive();
        $zip->open($tempPath, \ZipArchive::CREATE);
        foreach ($entries as $name => $contents) {
            $zip->addFromString($name, $contents);
        }
        $zip->close();

        $bytes = file_get_contents($tempPath);
        unlink($tempPath);

        return $bytes;
    }

    public function testExtractsXlsAndXlsxEntries(): void
    {
        $extractor = new ZipExtractor();
        $zipBytes = $this->buildZip([
            'alice.xls' => 'alice-content',
            'bob.xlsx' => 'bob-content',
        ]);

        $results = $extractor->extract($zipBytes);

        self::assertCount(2, $results);
        $byName = array_column($results, 1, 0);
        self::assertSame('alice-content', $byName['alice.xls']);
        self::assertSame('bob-content', $byName['bob.xlsx']);
    }

    public function testSkipsNonExcelEntries(): void
    {
        $extractor = new ZipExtractor();
        $zipBytes = $this->buildZip([
            'alice.xls' => 'alice-content',
            'readme.txt' => 'ignore me',
        ]);

        $results = $extractor->extract($zipBytes);

        self::assertCount(1, $results);
        self::assertSame('alice.xls', $results[0][0]);
    }

    public function testSkipsMacosxAndDotfiles(): void
    {
        $extractor = new ZipExtractor();
        $zipBytes = $this->buildZip([
            '__MACOSX/alice.xls' => 'macos junk',
            '.hidden.xls' => 'hidden junk',
            'alice.xls' => 'alice-content',
        ]);

        $results = $extractor->extract($zipBytes);

        self::assertCount(1, $results);
        self::assertSame('alice.xls', $results[0][0]);
    }

    public function testInvalidZipThrowsException(): void
    {
        $extractor = new ZipExtractor();

        $this->expectException(ZipExtractionException::class);
        try {
            $extractor->extract('not a real zip file');
        } catch (ZipExtractionException $exc) {
            self::assertSame('INVALID_ZIP', $exc->errorCode);
            throw $exc;
        }
    }

    public function testOversizedZipThrowsBeforeOpening(): void
    {
        $extractor = new ZipExtractor();

        $this->expectException(ZipExtractionException::class);
        try {
            $extractor->extract(str_repeat('x', ZipExtractor::MAX_ZIP_SIZE + 1));
        } catch (ZipExtractionException $exc) {
            self::assertSame('ZIP_TOO_LARGE', $exc->errorCode);
            throw $exc;
        }
    }

    public function testZipWithNoExcelFilesReturnsEmptyList(): void
    {
        // A genuinely zero-entry zip can't be built via ZipArchive (PHP
        // deletes the archive file entirely if closed with no entries
        // added) — a zip containing only non-Excel files is the
        // reachable equivalent of "no .xls files found".
        $extractor = new ZipExtractor();
        $zipBytes = $this->buildZip(['readme.txt' => 'nothing to see here']);

        self::assertSame([], $extractor->extract($zipBytes));
    }

    public function testOversizedIndividualFileThrows(): void
    {
        $extractor = new ZipExtractor();
        $zipBytes = $this->buildZip([
            'huge.xls' => str_repeat('x', ZipExtractor::MAX_FILE_SIZE + 1),
        ]);

        $this->expectException(ZipExtractionException::class);
        try {
            $extractor->extract($zipBytes);
        } catch (ZipExtractionException $exc) {
            self::assertSame('FILE_TOO_LARGE', $exc->errorCode);
            throw $exc;
        }
    }
}
