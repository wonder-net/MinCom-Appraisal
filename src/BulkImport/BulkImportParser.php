<?php

declare(strict_types=1);

namespace App\BulkImport;

use PhpOffice\PhpSpreadsheet\Reader\Xlsx;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * Port of apps.accounts.bulk_import_parser: parses an uploaded .xlsx/.csv
 * into ParsedBulkImport. Stateless — no Doctrine/service dependencies.
 */
final class BulkImportParser
{
    public const PARSER_MAX_DATA_ROWS = 10000;

    /** @var list<string> */
    private const EXPECTED_HEADERS = [
        'employee_number',
        'full_name',
        'email',
        'job_title',
        'department',
        'job_family',
        'location',
        'appraisor_employee_number',
        'roles',
    ];

    /**
     * TASK-287: legacy header renamed from manager_employee_number to
     * appraisor_employee_number — older templates keep working.
     *
     * @var array<string, string>
     */
    private const HEADER_ALIASES = [
        'manager_employee_number' => 'appraisor_employee_number',
    ];

    private const FORMULA_PREFIXES = ['=', '+', '-', '@'];

    public function parseFile(string $fileBytes, string $filename): ParsedBulkImport
    {
        return str_ends_with(strtolower($filename), '.csv')
            ? $this->parseCsv($fileBytes)
            : $this->parseXlsx($fileBytes);
    }

    public function parseXlsx(string $fileBytes): ParsedBulkImport
    {
        $tempPath = tempnam(sys_get_temp_dir(), 'bulk-import-');
        if ($tempPath === false) {
            throw new BulkImportParseException('Could not process the uploaded file.', 'INVALID_FORMAT');
        }

        try {
            file_put_contents($tempPath, $fileBytes);

            $reader = new Xlsx();
            $reader->setReadDataOnly(true);

            try {
                $spreadsheet = $reader->load($tempPath);
            } catch (\Throwable) {
                throw new BulkImportParseException('The uploaded file is not a valid .xlsx spreadsheet.', 'INVALID_FORMAT');
            }

            $sheetNames = $spreadsheet->getSheetNames();
            if ($sheetNames === []) {
                throw new BulkImportParseException('The spreadsheet has no sheets.', 'EMPTY_FILE');
            }

            $worksheet = in_array('Employees', $sheetNames, true)
                ? $spreadsheet->getSheetByName('Employees')
                : $spreadsheet->getSheet(0);

            return $this->parseRows($this->iterateWorksheetRows($worksheet), 'spreadsheet');
        } finally {
            @unlink($tempPath);
        }
    }

    /**
     * @return iterable<int, list<string>>
     */
    private function iterateWorksheetRows(Worksheet $worksheet): iterable
    {
        foreach ($worksheet->getRowIterator() as $row) {
            $cells = [];
            $cellIterator = $row->getCellIterator();
            $cellIterator->setIterateOnlyExistingCells(false);
            foreach ($cellIterator as $cell) {
                $cells[] = $cell->getValue();
            }
            yield $cells;
        }
    }

    public function parseCsv(string $fileBytes): ParsedBulkImport
    {
        // utf-8-sig equivalent: strip a leading BOM if present.
        if (str_starts_with($fileBytes, "\xEF\xBB\xBF")) {
            $fileBytes = substr($fileBytes, 3);
        }

        $stream = fopen('php://temp', 'r+');
        fwrite($stream, $fileBytes);
        rewind($stream);

        try {
            $rows = [];
            while (($row = fgetcsv($stream)) !== false) {
                $rows[] = array_map(static fn ($cell) => $cell ?? '', $row);
            }
        } finally {
            fclose($stream);
        }

        if ($rows === []) {
            throw new BulkImportParseException('The CSV file is empty.', 'EMPTY_FILE');
        }

        return $this->parseRows($rows, 'CSV file');
    }

    /**
     * @param iterable<int, list<string|int|float|bool|null>> $rowIterator
     */
    private function parseRows(iterable $rowIterator, string $formatLabel): ParsedBulkImport
    {
        // Deliberately NOT two separate foreach statements over the same
        // iterator: foreach always calls rewind() first, which throws on a
        // Generator (the xlsx path) once it has already advanced, and
        // silently restarts an ArrayIterator (the csv path) — either way
        // the header row would be mis-processed. Iterator methods called
        // directly give a genuine single-pass cursor for both cases.
        $iterator = is_array($rowIterator) ? new \ArrayIterator($rowIterator) : $rowIterator;
        $iterator->rewind();

        if (!$iterator->valid()) {
            // Unreachable for CSV in practice: parseCsv() already rejects a
            // fully empty file before calling parseRows(). Kept as a
            // defensive guard for the xlsx path (no header row at all).
            throw new BulkImportParseException('The spreadsheet is empty.', 'EMPTY_FILE');
        }

        $actualHeaders = array_map($this->normalizeHeader(...), $iterator->current());
        $headerIndex = $this->validateHeaders($actualHeaders);
        $iterator->next();

        $rows = [];
        $rowNumber = 1;
        $dataRowCount = 0;

        while ($iterator->valid()) {
            $row = $iterator->current();
            ++$rowNumber;

            if ($this->isBlankRow($row)) {
                $iterator->next();
                continue;
            }

            ++$dataRowCount;
            if ($dataRowCount > self::PARSER_MAX_DATA_ROWS) {
                throw new BulkImportParseException(
                    sprintf('Too many rows: maximum is %d. Split your upload into multiple files.', self::PARSER_MAX_DATA_ROWS),
                    'TOO_MANY_ROWS',
                );
            }

            $rows[] = $this->buildRow($rowNumber, $row, $headerIndex);
            $iterator->next();
        }

        if ($rows === []) {
            throw new BulkImportParseException(
                sprintf('The %s has no data rows (only a header row).', $formatLabel),
                'NO_DATA_ROWS',
            );
        }

        return new ParsedBulkImport(rows: $rows);
    }

    private function isBlankRow(array $row): bool
    {
        foreach ($row as $cell) {
            if ($this->cellToString($cell) !== '') {
                return false;
            }
        }

        return true;
    }

    /**
     * @param list<string|int|float|bool|null> $row
     * @param array<string, int> $headerIndex
     */
    private function buildRow(int $rowNumber, array $row, array $headerIndex): ParsedEmployeeRow
    {
        $get = function (string $column) use ($row, $headerIndex): string {
            $index = $headerIndex[$column];

            return array_key_exists($index, $row) ? $this->cellToString($row[$index]) : '';
        };

        return new ParsedEmployeeRow(
            rowNumber: $rowNumber,
            employeeNumber: $get('employee_number'),
            fullName: $get('full_name'),
            email: $get('email'),
            jobTitle: $get('job_title'),
            department: $get('department'),
            jobFamily: $get('job_family'),
            location: $get('location'),
            appraisorEmployeeNumber: $get('appraisor_employee_number'),
            rolesRaw: $get('roles'),
        );
    }

    /**
     * @param list<string> $actualHeaders
     * @return array<string, int>
     */
    private function validateHeaders(array $actualHeaders): array
    {
        $canonicalToLegacy = [];
        foreach (self::HEADER_ALIASES as $legacy => $canonical) {
            $canonicalToLegacy[$canonical][] = $legacy;
        }

        $missing = [];
        $headerIndex = [];

        foreach (self::EXPECTED_HEADERS as $expected) {
            $index = array_search($expected, $actualHeaders, true);
            if ($index !== false) {
                $headerIndex[$expected] = $index;
                continue;
            }

            $legacyMatch = null;
            foreach ($canonicalToLegacy[$expected] ?? [] as $alias) {
                $aliasIndex = array_search($alias, $actualHeaders, true);
                if ($aliasIndex !== false) {
                    $legacyMatch = $aliasIndex;
                    break;
                }
            }

            if ($legacyMatch !== null) {
                $headerIndex[$expected] = $legacyMatch;
            } else {
                $missing[] = $expected;
            }
        }

        if ($missing !== []) {
            throw new BulkImportParseException(
                sprintf(
                    'Missing required columns: %s. Expected columns: %s',
                    implode(', ', $missing),
                    implode(', ', self::EXPECTED_HEADERS),
                ),
                'MISSING_COLUMNS',
            );
        }

        return $headerIndex;
    }

    private function normalizeHeader(mixed $value): string
    {
        return str_replace(' ', '_', strtolower($this->cellToString($value)));
    }

    /**
     * Strips leading formula characters (=, +, -, @) to prevent CSV formula
     * injection if the data is ever re-exported to a spreadsheet.
     */
    private function cellToString(mixed $value): string
    {
        if ($value === null) {
            return '';
        }

        $s = trim((string) $value);
        while ($s !== '' && in_array($s[0], self::FORMULA_PREFIXES, true)) {
            $s = ltrim(substr($s, 1));
        }

        return $s;
    }
}
