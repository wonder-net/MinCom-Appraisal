<?php

declare(strict_types=1);

namespace App\Tests\Unit\AppraisalImport;

use App\AppraisalImport\ExcelParseException;
use App\AppraisalImport\ExcelParser;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx as XlsxWriter;
use PHPUnit\Framework\TestCase;

/**
 * Port of test_excel_parser.py's synthetic-.xls-fixture approach
 * (Django used xlwt; this builds equivalent .xlsx bytes via
 * PhpSpreadsheet's writer, following BulkImportParserTest's established
 * pattern), covering the parts of the real MINCOM PA Template cell
 * layout excel_parser.py depends on: header fields, KD rows, competency
 * rows, comment blocks, document totals, employee number scanning, and
 * the Growth Plans sheet.
 */
final class ExcelParserTest extends TestCase
{
    private function buildFormASheet(array $overrides = []): string
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('PerformanceAppraisal');

        $sheet->setCellValue('A1', $overrides['header'] ?? 'PA: Form A - Managerial');
        $sheet->setCellValue('B3', $overrides['employee_name'] ?? 'Jane Doe');
        $sheet->setCellValue('E3', $overrides['department'] ?? 'Engineering');
        $sheet->setCellValue('J3', $overrides['period'] ?? '2026 H1');
        $sheet->setCellValue('B4', $overrides['job_title'] ?? 'Engineering Manager');
        $sheet->setCellValue('E4', $overrides['job_family'] ?? 'Engineering');
        $sheet->setCellValue('G4', $overrides['location'] ?? 'Accra');

        // Employee number label/value pair (row 1, cols A/B -> excel A2/B2).
        $sheet->setCellValue('A2', 'Employee Number');
        $sheet->setCellValue('B2', $overrides['employee_number'] ?? 'EMP-042');

        // KD rows: one per perspective (Financial row7, Customer row14 -> 0-indexed 6/13 -> excel 8/15).
        $sheet->setCellValue('B8', 'Deliver financial report');
        $sheet->setCellValue('C8', 0.5);
        $sheet->setCellValue('D8', 4);
        $sheet->setCellValue('B15', 'Improve customer satisfaction');
        $sheet->setCellValue('C15', 0.5);
        $sheet->setCellValue('D15', 3.5);

        // Competency rows (0-indexed 7,9 -> excel 8,10), col H=name(7+1=8->H), col J=rating(9+1=10->J).
        $sheet->setCellValue('H8', 'Leadership');
        $sheet->setCellValue('J8', 4);
        $sheet->setCellValue('H10', 'Communication');
        $sheet->setCellValue('J10', 3);

        // Comments: Form A appraiser rows 40-47 (0-idx) -> excel 41-48; appraisee 49-56 -> excel 50-57.
        $sheet->setCellValue('B41', 'Strong quarter overall.');
        $sheet->setCellValue('B50', 'I agree with the assessment.');

        // Document totals: kd_avg row34/col4 -> excel row35/col E (formula); bc_avg row51/col9 -> excel52/J; total row35/col4->excel36/E.
        $sheet->setCellValue('E35', '=SUM(D8,D15)/2');
        $sheet->setCellValue('J52', '=SUM(J8,J10)/2');
        $sheet->setCellValue('E36', 4.0);

        $growthSheet = $spreadsheet->createSheet();
        $growthSheet->setTitle('Trg_Devpt & Growth Plans');
        $growthSheet->setCellValue('C5', 'Overall solid performance this cycle.');
        $growthSheet->setCellValue('C9', 'Strong technical skills');
        $growthSheet->setCellValue('E9', 'Time management');
        $growthSheet->setCellValue('C15', 'Complete AWS certification');
        $growthSheet->setCellValue('C22', 'Advanced Leadership');
        $growthSheet->setCellValue('E22', 'INSEAD');
        $growthSheet->setCellValue('J8', 'Engineering Director');
        $growthSheet->setCellValue('J14', 'Improve public speaking');

        // Signatures (Growth Plans sheet, Tab 2): row50/51 (0-idx) -> excel
        // 51/52; name col8or9 -> I/J; date col11 -> L.
        $growthSheet->setCellValue('I51', 'Jane Doe');
        $growthSheet->setCellValueExplicit('L51', '45700', \PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_NUMERIC);
        $growthSheet->getStyle('L51')->getNumberFormat()->setFormatCode('yyyy-mm-dd');
        $growthSheet->setCellValue('I52', 'Manager Name');

        return $this->writeToBytes($spreadsheet);
    }

    /**
     * The parser requires at least 6 data rows before it will even
     * attempt form-type detection; minimal fixtures below only care
     * about a handful of specific cells, so pad the sheet to clear
     * that floor.
     */
    private function padMinimalRows(\PhpOffice\PhpSpreadsheet\Worksheet\Worksheet $sheet): void
    {
        for ($row = 2; $row <= 6; ++$row) {
            $sheet->setCellValue('A'.$row, 'x');
        }
    }

    private function writeToBytes(Spreadsheet $spreadsheet): string
    {
        $tempPath = tempnam(sys_get_temp_dir(), 'excel-parser-test-').'.xlsx';
        (new XlsxWriter($spreadsheet))->save($tempPath);
        $bytes = file_get_contents($tempPath);
        unlink($tempPath);

        return $bytes;
    }

    public function testParsesFormAHeaderFields(): void
    {
        $parser = new ExcelParser();
        [$parsed] = $parser->parsePerformanceAppraisalSheet($this->buildFormASheet());

        self::assertSame('FORM_A', $parsed->formType);
        self::assertSame('Jane Doe', $parsed->employeeName);
        self::assertSame('Engineering', $parsed->department);
        self::assertSame('2026 H1', $parsed->period);
        self::assertSame('Engineering Manager', $parsed->jobTitle);
        self::assertSame('Accra', $parsed->location);
        self::assertSame('EMP-042', $parsed->employeeNumber);
    }

    public function testExtractsKeyDeliverables(): void
    {
        $parser = new ExcelParser();
        [$parsed] = $parser->parsePerformanceAppraisalSheet($this->buildFormASheet());

        self::assertCount(2, $parsed->keyDeliverables);
        self::assertSame('Deliver financial report', $parsed->keyDeliverables[0]->description);
        self::assertSame('Financial', $parsed->keyDeliverables[0]->perspectiveName);
        self::assertSame('0.5', $parsed->keyDeliverables[0]->weight);
        self::assertSame('4', $parsed->keyDeliverables[0]->managerRating);
        self::assertSame(1, $parsed->keyDeliverables[0]->sortOrder);
        self::assertSame('Customer', $parsed->keyDeliverables[1]->perspectiveName);
        self::assertSame('1', $parsed->kdWeightsSum);
    }

    public function testExtractsCompetencyRatings(): void
    {
        $parser = new ExcelParser();
        [$parsed] = $parser->parsePerformanceAppraisalSheet($this->buildFormASheet());

        self::assertCount(2, $parsed->competencyRatings);
        self::assertSame('Leadership', $parsed->competencyRatings[0]->competencyName);
        self::assertSame('4', $parsed->competencyRatings[0]->managerRating);
        self::assertSame('Communication', $parsed->competencyRatings[1]->competencyName);
    }

    public function testExtractsComments(): void
    {
        $parser = new ExcelParser();
        [$parsed] = $parser->parsePerformanceAppraisalSheet($this->buildFormASheet());

        self::assertCount(2, $parsed->comments);
        $byRole = [];
        foreach ($parsed->comments as $c) {
            $byRole[$c->authorRole] = $c->content;
        }
        self::assertSame('Strong quarter overall.', $byRole['APPRAISER']);
        self::assertSame('I agree with the assessment.', $byRole['APPRAISEE']);
    }

    public function testExtractsDocumentTotalsFromFormulas(): void
    {
        $parser = new ExcelParser();
        [$parsed] = $parser->parsePerformanceAppraisalSheet($this->buildFormASheet());

        self::assertSame('3.75', $parsed->documentKdAverage);
        self::assertSame('3.5', $parsed->documentBcAverage);
        self::assertSame('4', $parsed->documentTotalScore);
    }

    public function testZeroDocumentTotalsAreTreatedAsUnfilled(): void
    {
        $parser = new ExcelParser();
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('PerformanceAppraisal');
        $sheet->setCellValue('A1', 'PA: Form A - Managerial');
        $sheet->setCellValue('E35', 0);
        [$parsed] = $parser->parsePerformanceAppraisalSheet($this->writeToBytes($spreadsheet));

        self::assertNull($parsed->documentKdAverage);
    }

    public function testBlankKdRowsAreSkipped(): void
    {
        $parser = new ExcelParser();
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('PerformanceAppraisal');
        $sheet->setCellValue('A1', 'PA: Form A - Managerial');
        $this->padMinimalRows($sheet);
        [$parsed] = $parser->parsePerformanceAppraisalSheet($this->writeToBytes($spreadsheet));

        self::assertSame([], $parsed->keyDeliverables);
        self::assertSame('0', $parsed->kdWeightsSum);
    }

    public function testFormBDetection(): void
    {
        $parser = new ExcelParser();
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('PerformanceAppraisal');
        $sheet->setCellValue('A1', 'PA: Form B - Non-Managerial');
        $this->padMinimalRows($sheet);
        [$parsed] = $parser->parsePerformanceAppraisalSheet($this->writeToBytes($spreadsheet));

        self::assertSame('FORM_B', $parsed->formType);
    }

    public function testUnrecognisedFormTypeThrowsInvalidTemplate(): void
    {
        $parser = new ExcelParser();
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('PerformanceAppraisal');
        $sheet->setCellValue('A1', 'Something else entirely');
        for ($i = 0; $i < 6; ++$i) {
            $sheet->setCellValue('A'.($i + 2), 'x');
        }

        $this->expectException(ExcelParseException::class);
        try {
            $parser->parsePerformanceAppraisalSheet($this->writeToBytes($spreadsheet));
        } catch (ExcelParseException $exc) {
            self::assertSame(ExcelParseException::INVALID_TEMPLATE, $exc->errorCode);
            throw $exc;
        }
    }

    public function testMissingPerformanceAppraisalSheetThrowsInvalidTemplate(): void
    {
        $parser = new ExcelParser();
        $spreadsheet = new Spreadsheet();
        $spreadsheet->getActiveSheet()->setTitle('SomeOtherSheet');

        $this->expectException(ExcelParseException::class);
        $parser->parsePerformanceAppraisalSheet($this->writeToBytes($spreadsheet));
    }

    public function testEmptyFileThrowsInvalidTemplate(): void
    {
        $parser = new ExcelParser();

        $this->expectException(ExcelParseException::class);
        $parser->parsePerformanceAppraisalSheet('');
    }

    public function testParsesGrowthPlanSheet(): void
    {
        $parser = new ExcelParser();
        [, $workbook] = $parser->parsePerformanceAppraisalSheet($this->buildFormASheet());
        $gp = $parser->parseGrowthPlansSheet($workbook);

        self::assertNotNull($gp);
        self::assertSame('Overall solid performance this cycle.', $gp->overallAssessment);

        self::assertCount(1, $gp->strengths);
        self::assertSame('Strong technical skills', $gp->strengths[0]->description);
        self::assertCount(1, $gp->weaknesses);
        self::assertSame('Time management', $gp->weaknesses[0]->description);

        self::assertCount(2, $gp->trainingNeeds);
        $onTheJob = array_values(array_filter($gp->trainingNeeds, static fn ($n) => $n->type === 'ON_THE_JOB'));
        self::assertSame('Complete AWS certification', $onTheJob[0]->description);
        $courses = array_values(array_filter($gp->trainingNeeds, static fn ($n) => $n->type === 'RECOMMENDED_COURSE'));
        self::assertSame('Advanced Leadership', $courses[0]->courseTitle);
        self::assertSame('INSEAD', $courses[0]->institution);

        self::assertCount(1, $gp->careerPlans);
        self::assertSame('Engineering Director', $gp->careerPlans[0]->aspiredRole);
        self::assertSame('FIRST', $gp->careerPlans[0]->priority);

        self::assertCount(1, $gp->developmentNeeds);
        self::assertSame('Improve public speaking', $gp->developmentNeeds[0]->description);

        self::assertSame('Jane Doe', $gp->appraiseeSignName);
        self::assertSame('2025-02-12', $gp->appraiseeSignDate);
        self::assertSame('Manager Name', $gp->appraiserSignName);
    }

    public function testGrowthPlanEmptySectionsAreTracked(): void
    {
        $parser = new ExcelParser();
        $spreadsheet = new Spreadsheet();
        $spreadsheet->getActiveSheet()->setTitle('PerformanceAppraisal');
        $spreadsheet->getActiveSheet()->setCellValue('A1', 'PA: Form A - Managerial');
        $this->padMinimalRows($spreadsheet->getActiveSheet());
        $growthSheet = $spreadsheet->createSheet();
        $growthSheet->setTitle('Trg_Devpt & Growth Plans');

        [, $workbook] = $parser->parsePerformanceAppraisalSheet($this->writeToBytes($spreadsheet));
        $gp = $parser->parseGrowthPlansSheet($workbook);

        self::assertNotNull($gp);
        self::assertSame(['strengths', 'weaknesses', 'training_needs', 'career_plans', 'development_needs'], $gp->emptySections);
    }

    public function testNoGrowthPlanSheetReturnsNull(): void
    {
        $parser = new ExcelParser();
        $spreadsheet = new Spreadsheet();
        $spreadsheet->getActiveSheet()->setTitle('PerformanceAppraisal');
        $spreadsheet->getActiveSheet()->setCellValue('A1', 'PA: Form A - Managerial');
        $this->padMinimalRows($spreadsheet->getActiveSheet());

        [, $workbook] = $parser->parsePerformanceAppraisalSheet($this->writeToBytes($spreadsheet));

        // A single-sheet workbook (no second sheet, no name match) has no
        // growth plan sheet to fall back to.
        self::assertNull($parser->parseGrowthPlansSheet($workbook));
    }
}
