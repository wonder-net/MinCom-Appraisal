<?php

declare(strict_types=1);

namespace App\AppraisalImport;

use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * Port of excel_parser.py's public API (parse_performance_appraisal_sheet /
 * parse_growth_plans_sheet) for MINCOM PA Templates (Form A and Form B).
 *
 * Django needed two libraries (xlrd for .xls, openpyxl for .xlsx) behind
 * an adapter shim because neither reads both formats. PhpSpreadsheet
 * reads both natively via IOFactory's content-sniffing reader
 * selection, so that dual-path complexity collapses to one code path
 * here.
 *
 * All cell coordinates below are 0-indexed (row, col), matching the
 * original xlrd-based row/column constants byte-for-byte — readCell()
 * is the only place that translates to PhpSpreadsheet's 1-indexed
 * A1-style coordinates.
 *
 * Cells are read via getCalculatedValue() rather than getValue(): the
 * document-total cells (KD/BC average, total score) are SUM() formulas
 * in the real templates, and getCalculatedValue() evaluates them
 * live from the sheet's current data — arguably more correct than
 * Django's approach of trusting whatever value the spreadsheet
 * application last cached on save.
 */
final class ExcelParser
{
    private const FORM_A_PERSPECTIVES = [
        ['name' => 'Financial', 'rows' => [7, 8, 9, 10, 11, 12]],
        ['name' => 'Customer', 'rows' => [14, 15, 16, 17, 18, 19]],
        ['name' => 'Internal Business Processes', 'rows' => [21, 22, 23, 24, 25, 26]],
        ['name' => 'Learning and Growth', 'rows' => [28, 29, 30, 31, 32, 33]],
    ];

    private const FORM_B_PERSPECTIVES = [
        ['name' => 'Financial', 'rows' => [7, 8, 9, 10]],
        ['name' => 'Customer', 'rows' => [12, 13, 14, 15]],
        ['name' => 'Internal Business Processes', 'rows' => [17, 18, 19, 20]],
        ['name' => 'Learning and Growth', 'rows' => [22, 23, 24, 25]],
    ];

    // Every-other-row starting at 7: 7,9,...,23 (Form A) / 7,9,...,21 (Form B).
    private const FORM_A_COMPETENCY_ROWS = [7, 9, 11, 13, 15, 17, 19, 21, 23];
    private const FORM_B_COMPETENCY_ROWS = [7, 9, 11, 13, 15, 17, 19, 21];

    private const FORM_A_APPRAISER_COMMENT_ROWS = [40, 41, 42, 43, 44, 45, 46, 47];
    private const FORM_A_APPRAISEE_COMMENT_ROWS = [49, 50, 51, 52, 53, 54, 55, 56];
    private const FORM_B_APPRAISER_COMMENT_ROWS = [32, 33, 34, 35, 36, 37, 38, 39];
    private const FORM_B_APPRAISEE_COMMENT_ROWS = [41, 42, 43, 44, 45, 46, 47, 48];

    private const KD_COL_DESCRIPTION = 1;
    private const KD_COL_WEIGHT = 2;
    private const KD_COL_RATING = 3;

    private const COMP_COL_NAME = 7;
    private const COMP_COL_RATING = 9;

    private const HDR_NAME_VALUE_COL = 1;
    private const HDR_DEPT_VALUE_COL = 4;
    private const HDR_PERIOD_VALUE_COL = 9;
    private const HDR_JOB_TITLE_VALUE_COL = 1;
    private const HDR_JOB_FAMILY_VALUE_COL = 4;
    private const HDR_LOCATION_VALUE_COL = 6;

    private const GP_SHEET_NAME_VARIANTS = ['Trg_Devpt & Growth Plans', 'Trg_Devpt &amp; Growth Plans'];

    private const GP_OVERALL_ASSESSMENT_ROW = 4;
    private const GP_OVERALL_ASSESSMENT_COL = 2;
    private const GP_STRENGTH_ROWS = [8, 9, 10, 11];
    private const GP_STRENGTH_COL = 2;
    private const GP_WEAKNESS_ROWS = [8, 9, 10, 11];
    private const GP_WEAKNESS_COL = 4;
    private const GP_OTJ_TRAINING_ROWS = [14, 15, 16, 17];
    private const GP_OTJ_TRAINING_COL = 2;
    private const GP_COURSE_ROWS = [21, 22, 23];
    private const GP_COURSE_TITLE_COL = 2;
    private const GP_COURSE_INSTITUTION_COL = 4;
    private const GP_CAREER_ROWS = [7, 8, 9];
    private const GP_CAREER_COL = 9;
    private const GP_DEV_NEED_ROWS = [13, 14, 15];
    private const GP_DEV_NEED_COL = 9;

    private const PRIORITY_BY_OFFSET = ['FIRST', 'SECOND', 'THIRD'];

    /**
     * @return array{0: ParsedAppraisalSheet, 1: Spreadsheet}
     */
    public function parsePerformanceAppraisalSheet(string $fileBytes): array
    {
        if ($fileBytes === '') {
            throw new ExcelParseException('Empty file provided.', ExcelParseException::INVALID_TEMPLATE);
        }

        $workbook = $this->openWorkbook($fileBytes);
        $sheet = $workbook->getSheetByName('PerformanceAppraisal');
        if ($sheet === null) {
            throw new ExcelParseException(
                sprintf('Sheet \'PerformanceAppraisal\' not found in workbook. Available sheets: %s', implode(', ', $workbook->getSheetNames())),
                ExcelParseException::INVALID_TEMPLATE,
            );
        }

        $nrows = $sheet->getHighestDataRow();
        if ($nrows < 6) {
            throw new ExcelParseException(
                sprintf('Sheet has only %d rows, expected at least 6.', $nrows),
                ExcelParseException::INVALID_TEMPLATE,
            );
        }

        $headerValue = $this->safeString($this->readCell($sheet, 0, 0));
        $formType = $this->detectFormType($headerValue);

        $perspectives = $formType === 'FORM_A' ? self::FORM_A_PERSPECTIVES : self::FORM_B_PERSPECTIVES;

        try {
            $employeeName = $this->safeString($this->readCell($sheet, 2, self::HDR_NAME_VALUE_COL));
            $department = $this->safeString($this->readCell($sheet, 2, self::HDR_DEPT_VALUE_COL));
            $period = $this->safeString($this->readCell($sheet, 2, self::HDR_PERIOD_VALUE_COL));
            $jobTitle = $this->safeString($this->readCell($sheet, 3, self::HDR_JOB_TITLE_VALUE_COL));
            $jobFamily = $this->safeString($this->readCell($sheet, 3, self::HDR_JOB_FAMILY_VALUE_COL));
            $location = $this->safeString($this->readCell($sheet, 3, self::HDR_LOCATION_VALUE_COL));

            [$keyDeliverables, $kdWeightsSum] = $this->extractKdRows($sheet, $perspectives);

            $competencyRows = $formType === 'FORM_A' ? self::FORM_A_COMPETENCY_ROWS : self::FORM_B_COMPETENCY_ROWS;
            $competencyRatings = $this->extractCompetencyRows($sheet, $competencyRows);

            $comments = $this->extractComments($sheet, $formType);

            $employeeNumber = $this->extractEmployeeNumber($sheet);

            [$documentKdAverage, $documentBcAverage, $documentTotalScore] = $this->extractDocumentTotals($sheet, $formType);
        } catch (\Throwable $exc) {
            throw new ExcelParseException(sprintf('Unexpected error parsing sheet: %s', $exc->getMessage()), ExcelParseException::PARSE_ERROR);
        }

        $parsedSheet = new ParsedAppraisalSheet(
            formType: $formType,
            employeeName: $employeeName,
            department: $department,
            jobTitle: $jobTitle,
            jobFamily: $jobFamily,
            location: $location,
            period: $period,
            keyDeliverables: $keyDeliverables,
            competencyRatings: $competencyRatings,
            comments: $comments,
            kdWeightsSum: $kdWeightsSum,
            employeeNumber: $employeeNumber,
            documentKdAverage: $documentKdAverage,
            documentBcAverage: $documentBcAverage,
            documentTotalScore: $documentTotalScore,
        );

        return [$parsedSheet, $workbook];
    }

    public function parseGrowthPlansSheet(Spreadsheet $workbook): ?ParsedGrowthPlan
    {
        $sheet = $this->getGrowthPlanSheet($workbook);
        if ($sheet === null) {
            return null;
        }

        $col2Val = $this->safeString($this->readCell($sheet, self::GP_OVERALL_ASSESSMENT_ROW, self::GP_OVERALL_ASSESSMENT_COL));
        if ($col2Val !== '') {
            $overallAssessment = $col2Val;
        } else {
            $col1Val = $this->safeString($this->readCell($sheet, self::GP_OVERALL_ASSESSMENT_ROW, 1));
            $overallAssessment = str_contains($col1Val, ':') ? trim(explode(':', $col1Val, 2)[1]) : '';
        }

        [$strengths, $weaknesses] = $this->extractStrengthsWeaknesses($sheet);
        $trainingNeeds = $this->extractTrainingNeeds($sheet);
        $careerPlans = $this->extractCareerPlans($sheet);
        $developmentNeeds = $this->extractDevelopmentNeeds($sheet);

        $emptySections = [];
        if ($strengths === []) {
            $emptySections[] = 'strengths';
        }
        if ($weaknesses === []) {
            $emptySections[] = 'weaknesses';
        }
        if ($trainingNeeds === []) {
            $emptySections[] = 'training_needs';
        }
        if ($careerPlans === []) {
            $emptySections[] = 'career_plans';
        }
        if ($developmentNeeds === []) {
            $emptySections[] = 'development_needs';
        }

        [$appraiseeSignName, $appraiseeSignDate, $appraiserSignName, $appraiserSignDate] = $this->extractSignatureData($sheet);

        return new ParsedGrowthPlan(
            overallAssessment: $overallAssessment,
            strengths: $strengths,
            weaknesses: $weaknesses,
            trainingNeeds: $trainingNeeds,
            careerPlans: $careerPlans,
            developmentNeeds: $developmentNeeds,
            emptySections: $emptySections,
            appraiseeSignName: $appraiseeSignName,
            appraiseeSignDate: $appraiseeSignDate,
            appraiserSignName: $appraiserSignName,
            appraiserSignDate: $appraiserSignDate,
        );
    }

    private function openWorkbook(string $fileBytes): Spreadsheet
    {
        $tempPath = tempnam(sys_get_temp_dir(), 'appraisal-xls-');
        if ($tempPath === false) {
            throw new ExcelParseException('Could not process the uploaded file.', ExcelParseException::INVALID_TEMPLATE);
        }

        try {
            file_put_contents($tempPath, $fileBytes);

            try {
                $reader = IOFactory::createReaderForFile($tempPath);

                return $reader->load($tempPath);
            } catch (\Throwable $exc) {
                throw new ExcelParseException(sprintf('Invalid Excel file: %s', $exc->getMessage()), ExcelParseException::INVALID_TEMPLATE);
            }
        } finally {
            @unlink($tempPath);
        }
    }

    private function detectFormType(string $headerValue): string
    {
        $cleaned = trim($headerValue);
        if (str_starts_with($cleaned, 'PA: Form A')) {
            return 'FORM_A';
        }
        if (str_starts_with($cleaned, 'PA: Form B')) {
            return 'FORM_B';
        }

        throw new ExcelParseException(
            sprintf('Unrecognised form type in cell(0,0): "%s". Expected \'PA: Form A\' or \'PA: Form B\'.', $cleaned),
            ExcelParseException::INVALID_TEMPLATE,
        );
    }

    /**
     * @param list<array{name: string, rows: list<int>}> $perspectives
     * @return array{0: list<ParsedKd>, 1: string}
     */
    private function extractKdRows(Worksheet $sheet, array $perspectives): array
    {
        $kds = [];
        $totalWeight = '0';
        $globalSort = 0;

        foreach ($perspectives as $perspective) {
            foreach ($perspective['rows'] as $rowIdx) {
                $description = $this->safeString($this->readCell($sheet, $rowIdx, self::KD_COL_DESCRIPTION));
                if ($description === '') {
                    continue;
                }

                $weight = $this->safeDecimalWeight($this->readCell($sheet, $rowIdx, self::KD_COL_WEIGHT));
                $managerRating = $this->safeDecimal($this->readCell($sheet, $rowIdx, self::KD_COL_RATING));
                $totalWeight = bcadd($totalWeight, $weight, 10);
                ++$globalSort;

                $kds[] = new ParsedKd(
                    perspectiveName: $perspective['name'],
                    description: $description,
                    weight: $weight,
                    managerRating: $managerRating,
                    selfRating: null,
                    sortOrder: $globalSort,
                );
            }
        }

        // bcadd's fixed scale=10 accumulator leaves trailing zeros (e.g.
        // "1.0000000000"); trim to a natural-precision string so
        // kd_weights_sum reads cleanly wherever it surfaces (e.g. the
        // "KD weights sum to X, not 1.0" warning), matching Python
        // Decimal's precision-preserving (not padding) addition.
        return [$kds, $this->trimTrailingZeros($totalWeight)];
    }

    /**
     * @param list<int> $competencyRows
     * @return list<ParsedCompetencyRating>
     */
    private function extractCompetencyRows(Worksheet $sheet, array $competencyRows): array
    {
        $ratings = [];
        foreach ($competencyRows as $rowIdx) {
            $name = $this->safeString($this->readCell($sheet, $rowIdx, self::COMP_COL_NAME));
            if ($name === '') {
                continue;
            }

            $ratings[] = new ParsedCompetencyRating(
                competencyName: $name,
                managerRating: $this->safeDecimal($this->readCell($sheet, $rowIdx, self::COMP_COL_RATING)),
                selfRating: null,
            );
        }

        return $ratings;
    }

    /**
     * @param list<int> $contentRows
     */
    private function extractCommentBlock(Worksheet $sheet, array $contentRows): string
    {
        $lines = [];
        foreach ($contentRows as $rowIdx) {
            $col0 = $this->safeString($this->readCell($sheet, $rowIdx, 0));
            $col1 = $this->safeString($this->readCell($sheet, $rowIdx, 1));
            $line = $col1 !== '' ? $col1 : $col0;
            if ($line !== '') {
                $lines[] = $line;
            }
        }

        return implode("\n", $lines);
    }

    /**
     * @return list<ParsedComment>
     */
    private function extractComments(Worksheet $sheet, string $formType): array
    {
        $appraiserRows = $formType === 'FORM_A' ? self::FORM_A_APPRAISER_COMMENT_ROWS : self::FORM_B_APPRAISER_COMMENT_ROWS;
        $appraiseeRows = $formType === 'FORM_A' ? self::FORM_A_APPRAISEE_COMMENT_ROWS : self::FORM_B_APPRAISEE_COMMENT_ROWS;

        $comments = [];

        $appraiserText = $this->extractCommentBlock($sheet, $appraiserRows);
        if ($appraiserText !== '') {
            $comments[] = new ParsedComment('APPRAISER', $appraiserText);
        }

        $appraiseeText = $this->extractCommentBlock($sheet, $appraiseeRows);
        if ($appraiseeText !== '') {
            $comments[] = new ParsedComment('APPRAISEE', $appraiseeText);
        }

        return $comments;
    }

    private function extractEmployeeNumber(Worksheet $sheet): string
    {
        $patterns = ['employee number', 'employee no', 'emp no'];
        $nrows = min(6, $sheet->getHighestDataRow());
        $ncols = min(Coordinate::columnIndexFromString($sheet->getHighestDataColumn()), 12);

        for ($rowIdx = 0; $rowIdx < $nrows; ++$rowIdx) {
            for ($colIdx = 0; $colIdx < $ncols; ++$colIdx) {
                $cellVal = trim($this->safeString($this->readCell($sheet, $rowIdx, $colIdx)));
                $cellLower = strtolower($cellVal);
                $matches = false;
                foreach ($patterns as $pattern) {
                    if (str_contains($cellLower, $pattern)) {
                        $matches = true;
                        break;
                    }
                }
                if (!$matches) {
                    continue;
                }

                if (str_contains($cellVal, ':')) {
                    $afterColon = trim(explode(':', $cellVal, 2)[1]);
                    if ($afterColon !== '') {
                        return $afterColon;
                    }
                }

                $nextVal = trim($this->safeString($this->readCell($sheet, $rowIdx, $colIdx + 1)));
                if ($nextVal !== '' && !$this->containsAny(strtolower($nextVal), ['department', 'period', 'job', 'location', 'name'])) {
                    return $nextVal;
                }

                $belowVal = trim($this->safeString($this->readCell($sheet, $rowIdx + 1, $colIdx)));
                if ($belowVal !== '' && !$this->containsAny(strtolower($belowVal), ['department', 'period', 'job', 'location', 'name', 'title', 'family', 'weight', 'rating', 'key'])) {
                    return $belowVal;
                }
            }
        }

        return '';
    }

    /**
     * @param list<string> $needles
     */
    private function containsAny(string $haystack, array $needles): bool
    {
        foreach ($needles as $needle) {
            if (str_contains($haystack, $needle)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array{0: ?string, 1: ?string, 2: ?string}
     */
    private function extractDocumentTotals(Worksheet $sheet, string $formType): array
    {
        if ($formType === 'FORM_A') {
            [$kdAvgRow, $kdAvgCol] = [34, 4];
            [$bcAvgRow, $bcAvgCol] = [51, 9];
            [$totalRow, $totalCol] = [35, 4];
        } else {
            [$kdAvgRow, $kdAvgCol] = [26, 4];
            [$bcAvgRow, $bcAvgCol] = [43, 9];
            [$totalRow, $totalCol] = [27, 4];
        }

        $nrows = $sheet->getHighestDataRow();

        $kdAvg = $kdAvgRow < $nrows ? $this->safeDecimalWeight($this->readCell($sheet, $kdAvgRow, $kdAvgCol)) : null;
        $bcAvg = $bcAvgRow < $nrows ? $this->safeDecimalWeight($this->readCell($sheet, $bcAvgRow, $bcAvgCol)) : null;
        $total = $totalRow < $nrows ? $this->safeDecimalWeight($this->readCell($sheet, $totalRow, $totalCol)) : null;

        if ($kdAvg !== null && bccomp($kdAvg, '0', 10) === 0) {
            $kdAvg = null;
        }
        if ($bcAvg !== null && bccomp($bcAvg, '0', 10) === 0) {
            $bcAvg = null;
        }
        if ($total !== null && bccomp($total, '0', 10) === 0) {
            $total = null;
        }

        return [$kdAvg, $bcAvg, $total];
    }

    /**
     * @return array{0: list<ParsedStrengthWeakness>, 1: list<ParsedStrengthWeakness>}
     */
    private function extractStrengthsWeaknesses(Worksheet $sheet): array
    {
        $strengths = [];
        $weaknesses = [];

        foreach (self::GP_STRENGTH_ROWS as $rowIdx) {
            $text = $this->safeString($this->readCell($sheet, $rowIdx, self::GP_STRENGTH_COL));
            if ($text !== '') {
                $strengths[] = new ParsedStrengthWeakness('STRENGTH', $text);
            }
        }

        foreach (self::GP_WEAKNESS_ROWS as $rowIdx) {
            $text = $this->safeString($this->readCell($sheet, $rowIdx, self::GP_WEAKNESS_COL));
            if ($text !== '') {
                $weaknesses[] = new ParsedStrengthWeakness('WEAKNESS', $text);
            }
        }

        return [$strengths, $weaknesses];
    }

    /**
     * @return list<ParsedTrainingNeed>
     */
    private function extractTrainingNeeds(Worksheet $sheet): array
    {
        $needs = [];

        foreach (self::GP_OTJ_TRAINING_ROWS as $offset => $rowIdx) {
            $desc = $this->safeString($this->readCell($sheet, $rowIdx, self::GP_OTJ_TRAINING_COL));
            if ($desc === '') {
                continue;
            }
            $priority = self::PRIORITY_BY_OFFSET[min($offset, count(self::PRIORITY_BY_OFFSET) - 1)];
            $needs[] = new ParsedTrainingNeed('ON_THE_JOB', $desc, null, null, $priority);
        }

        foreach (self::GP_COURSE_ROWS as $offset => $rowIdx) {
            $title = $this->safeString($this->readCell($sheet, $rowIdx, self::GP_COURSE_TITLE_COL));
            if ($title === '') {
                continue;
            }
            $institution = $this->safeString($this->readCell($sheet, $rowIdx, self::GP_COURSE_INSTITUTION_COL));
            $priority = self::PRIORITY_BY_OFFSET[min($offset, count(self::PRIORITY_BY_OFFSET) - 1)];
            $needs[] = new ParsedTrainingNeed('RECOMMENDED_COURSE', $title, $title, $institution !== '' ? $institution : null, $priority);
        }

        return $needs;
    }

    /**
     * @return list<ParsedCareerPlan>
     */
    private function extractCareerPlans(Worksheet $sheet): array
    {
        $plans = [];
        foreach (self::GP_CAREER_ROWS as $offset => $rowIdx) {
            $role = $this->safeString($this->readCell($sheet, $rowIdx, self::GP_CAREER_COL));
            if ($role === '') {
                continue;
            }
            $priority = self::PRIORITY_BY_OFFSET[min($offset, count(self::PRIORITY_BY_OFFSET) - 1)];
            $plans[] = new ParsedCareerPlan($role, $priority);
        }

        return $plans;
    }

    /**
     * @return list<ParsedDevelopmentNeed>
     */
    private function extractDevelopmentNeeds(Worksheet $sheet): array
    {
        $needs = [];
        foreach (self::GP_DEV_NEED_ROWS as $offset => $rowIdx) {
            $desc = $this->safeString($this->readCell($sheet, $rowIdx, self::GP_DEV_NEED_COL));
            if ($desc === '') {
                continue;
            }
            $priority = self::PRIORITY_BY_OFFSET[min($offset, count(self::PRIORITY_BY_OFFSET) - 1)];
            $needs[] = new ParsedDevelopmentNeed($desc, $priority);
        }

        return $needs;
    }

    /**
     * @return array{0: string, 1: string, 2: string, 3: string}
     */
    private function extractSignatureData(Worksheet $sheet): array
    {
        $appraiseeName = '';
        $appraiseeDate = '';
        $appraiserName = '';
        $appraiserDate = '';

        $nrows = $sheet->getHighestDataRow();

        if ($nrows > 50) {
            $nameVal = $this->safeString($this->readCell($sheet, 50, 8));
            if ($nameVal === '') {
                $nameVal = $this->safeString($this->readCell($sheet, 50, 9));
            }
            $appraiseeName = $nameVal;
            $appraiseeDate = $this->parseDateCell($sheet, 50, 11);
        }

        if ($nrows > 51) {
            $nameVal = $this->safeString($this->readCell($sheet, 51, 8));
            if ($nameVal === '') {
                $nameVal = $this->safeString($this->readCell($sheet, 51, 9));
            }
            $appraiserName = $nameVal;
            $appraiserDate = $this->parseDateCell($sheet, 51, 11);
        }

        return [$appraiseeName, $appraiseeDate, $appraiserName, $appraiserDate];
    }

    private function parseDateCell(Worksheet $sheet, int $row0, int $col0): string
    {
        $coord = Coordinate::stringFromColumnIndex($col0 + 1).($row0 + 1);
        $cell = $sheet->getCell($coord);
        $value = $cell->getCalculatedValue();

        if ($value === null || $value === '') {
            return '';
        }

        if (is_numeric($value) && ExcelDate::isDateTime($cell)) {
            try {
                return ExcelDate::excelToDateTimeObject((float) $value)->format('Y-m-d');
            } catch (\Throwable) {
                // Fall through to string representation below.
            }
        }

        return trim((string) $value);
    }

    private function getGrowthPlanSheet(Spreadsheet $workbook): ?Worksheet
    {
        foreach (self::GP_SHEET_NAME_VARIANTS as $name) {
            $sheet = $workbook->getSheetByName($name);
            if ($sheet !== null) {
                return $sheet;
            }
        }

        return $workbook->getSheetCount() >= 2 ? $workbook->getSheet(1) : null;
    }

    private function readCell(Worksheet $sheet, int $row0, int $col0): mixed
    {
        $coord = Coordinate::stringFromColumnIndex($col0 + 1).($row0 + 1);
        try {
            return $sheet->getCell($coord)->getCalculatedValue();
        } catch (\Throwable) {
            return null;
        }
    }

    private function safeDecimal(mixed $value): ?string
    {
        if ($value === null || $value === '' || !is_numeric($value)) {
            return null;
        }

        $d = $this->toDecimalString($value);

        return bccomp($d, '0', 10) === 0 ? null : $d;
    }

    private function safeDecimalWeight(mixed $value): string
    {
        if ($value === null || $value === '' || !is_numeric($value)) {
            return '0';
        }

        return $this->toDecimalString($value);
    }

    private function safeString(mixed $value): string
    {
        if ($value === null) {
            return '';
        }

        return trim((string) $value);
    }

    private function toDecimalString(int|float|string $value): string
    {
        if (is_string($value)) {
            return trim($value);
        }

        $s = rtrim(rtrim(sprintf('%.10F', (float) $value), '0'), '.');

        return $s === '' || $s === '-' ? '0' : $s;
    }

    /**
     * Trims trailing zeros from a bcmath fixed-scale result (e.g.
     * "1.0000000000" -> "1"), matching Python Decimal's natural
     * (precision-preserving, not padding) addition.
     */
    private function trimTrailingZeros(string $decimal): string
    {
        if (!str_contains($decimal, '.')) {
            return $decimal;
        }

        $trimmed = rtrim(rtrim($decimal, '0'), '.');

        return $trimmed === '' || $trimmed === '-' ? '0' : $trimmed;
    }
}
