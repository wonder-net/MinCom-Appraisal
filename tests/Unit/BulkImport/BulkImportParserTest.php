<?php

declare(strict_types=1);

namespace App\Tests\Unit\BulkImport;

use App\BulkImport\BulkImportParseException;
use App\BulkImport\BulkImportParser;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx as XlsxWriter;
use PHPUnit\Framework\TestCase;

final class BulkImportParserTest extends TestCase
{
    private const HEADERS = [
        'employee_number', 'full_name', 'email', 'job_title', 'department',
        'job_family', 'location', 'appraisor_employee_number', 'roles',
    ];

    private function buildXlsxBytes(array $rows): string
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Employees');
        $sheet->fromArray(self::HEADERS, null, 'A1');
        foreach ($rows as $i => $row) {
            $sheet->fromArray($row, null, 'A'.($i + 2));
        }

        $tempPath = tempnam(sys_get_temp_dir(), 'test-xlsx-');
        (new XlsxWriter($spreadsheet))->save($tempPath);
        $bytes = file_get_contents($tempPath);
        unlink($tempPath);

        return $bytes;
    }

    private function buildCsvBytes(array $rows): string
    {
        $stream = fopen('php://temp', 'r+');
        fputcsv($stream, self::HEADERS);
        foreach ($rows as $row) {
            fputcsv($stream, $row);
        }
        rewind($stream);
        $bytes = stream_get_contents($stream);
        fclose($stream);

        return $bytes;
    }

    public function testParsesXlsxWithMultipleRows(): void
    {
        $bytes = $this->buildXlsxBytes([
            ['EMP-001', 'Jane Doe', 'jane@example.com', 'Engineer', 'IT', 'Engineering', 'Accra', '', 'EMPLOYEE'],
            ['EMP-002', 'John Smith', 'john@example.com', 'Manager', 'IT', 'Engineering', 'Accra', 'EMP-001', 'MANAGER'],
        ]);

        $parsed = (new BulkImportParser())->parseFile($bytes, 'employees.xlsx');

        self::assertCount(2, $parsed->rows);
        self::assertSame('EMP-001', $parsed->rows[0]->employeeNumber);
        self::assertSame('jane@example.com', $parsed->rows[0]->email);
        self::assertSame(2, $parsed->rows[0]->rowNumber);
        self::assertSame('EMP-002', $parsed->rows[1]->employeeNumber);
        self::assertSame('EMP-001', $parsed->rows[1]->appraisorEmployeeNumber);
        self::assertSame(3, $parsed->rows[1]->rowNumber);
    }

    public function testParsesCsvWithBom(): void
    {
        $bytes = "\xEF\xBB\xBF".$this->buildCsvBytes([
            ['EMP-010', 'Ama Owusu', 'ama@example.com', 'Analyst', 'Finance', '', 'Accra', '', 'EMPLOYEE'],
        ]);

        $parsed = (new BulkImportParser())->parseFile($bytes, 'employees.csv');

        self::assertCount(1, $parsed->rows);
        self::assertSame('ama@example.com', $parsed->rows[0]->email);
    }

    public function testSkipsBlankRows(): void
    {
        $bytes = $this->buildXlsxBytes([
            ['EMP-001', 'Jane Doe', 'jane@example.com', 'Engineer', 'IT', '', 'Accra', '', 'EMPLOYEE'],
            ['', '', '', '', '', '', '', '', ''],
            ['EMP-002', 'John Smith', 'john@example.com', 'Manager', 'IT', '', 'Accra', '', 'MANAGER'],
        ]);

        $parsed = (new BulkImportParser())->parseFile($bytes, 'employees.xlsx');

        self::assertCount(2, $parsed->rows);
        self::assertSame('EMP-001', $parsed->rows[0]->employeeNumber);
        self::assertSame('EMP-002', $parsed->rows[1]->employeeNumber);
    }

    public function testMissingColumnsRaisesParseException(): void
    {
        $stream = fopen('php://temp', 'r+');
        fputcsv($stream, ['employee_number', 'full_name']); // missing most columns
        fputcsv($stream, ['EMP-001', 'Jane Doe']);
        rewind($stream);
        $bytes = stream_get_contents($stream);
        fclose($stream);

        $this->expectException(BulkImportParseException::class);
        (new BulkImportParser())->parseCsv($bytes);
    }

    public function testLegacyManagerHeaderAliasResolves(): void
    {
        $stream = fopen('php://temp', 'r+');
        $headers = self::HEADERS;
        $headers[array_search('appraisor_employee_number', $headers, true)] = 'manager_employee_number';
        fputcsv($stream, $headers);
        fputcsv($stream, ['EMP-001', 'Jane Doe', 'jane@example.com', 'Engineer', 'IT', '', 'Accra', 'EMP-000', 'EMPLOYEE']);
        rewind($stream);
        $bytes = stream_get_contents($stream);
        fclose($stream);

        $parsed = (new BulkImportParser())->parseCsv($bytes);

        self::assertSame('EMP-000', $parsed->rows[0]->appraisorEmployeeNumber);
    }

    public function testEmptyFileRaisesParseException(): void
    {
        $this->expectException(BulkImportParseException::class);
        (new BulkImportParser())->parseCsv('');
    }

    public function testHeaderOnlyFileRaisesNoDataRowsException(): void
    {
        $bytes = $this->buildCsvBytes([]);

        $this->expectExceptionMessage('The CSV file has no data rows (only a header row).');
        (new BulkImportParser())->parseCsv($bytes);
    }

    public function testFormulaPrefixIsStripped(): void
    {
        $bytes = $this->buildCsvBytes([
            ['EMP-001', '=SUM(A1:A2)', 'jane@example.com', 'Engineer', 'IT', '', 'Accra', '', 'EMPLOYEE'],
        ]);

        $parsed = (new BulkImportParser())->parseFile($bytes, 'employees.csv');

        self::assertSame('SUM(A1:A2)', $parsed->rows[0]->fullName);
    }
}
