<?php

declare(strict_types=1);

namespace App\AppraisalImport;

use App\Repository\EmployeeRepository;

/**
 * Port of appraisal_bulk_import_service.AppraisalBulkImportPreviewService.
 * Orchestrates Step 1: parse all files, match employees, validate
 * scores. Read-only — no persistence.
 */
final class AppraisalBulkImportPreviewService
{
    public function __construct(
        private readonly EmployeeRepository $employees,
        private readonly ExcelParser $excelParser,
        private readonly FuzzyMatcher $fuzzyMatcher,
        private readonly ScoreValidationService $scoreValidationService,
    ) {
    }

    /**
     * @param list<array{0: string, 1: string}> $files list of [filename, bytes]
     */
    public function preview(array $files, string $targetStatus): BulkImportPreview
    {
        $employeeList = $this->buildEmployeeList();
        $preview = new BulkImportPreview(count($files));

        foreach ($files as [$filename, $fileBytes]) {
            $fp = $this->processFile($filename, $fileBytes, $employeeList);
            $preview->files[] = $fp;

            if ($fp->errors !== []) {
                ++$preview->errors;
            } elseif ($fp->matchResult !== null) {
                if (in_array($fp->matchResult->matchType, ['exact', 'auto'], true)) {
                    ++$preview->matched;
                } elseif ($fp->matchResult->matchType === 'suggested') {
                    ++$preview->suggested;
                } else {
                    ++$preview->unmatched;
                }
            } else {
                ++$preview->unmatched;
            }

            if ($fp->scoreValidation?->hasDiscrepancy === true) {
                ++$preview->scoreDiscrepancies;
            }
        }

        return $preview;
    }

    /**
     * @param list<array<string, mixed>> $employees
     */
    private function processFile(string $filename, string $fileBytes, array $employees): FilePreview
    {
        $fp = new FilePreview($filename);

        try {
            [$parsedSheet, $workbook] = $this->excelParser->parsePerformanceAppraisalSheet($fileBytes);
        } catch (ExcelParseException $exc) {
            $fp->errors[] = $exc->getMessage();

            return $fp;
        }

        $fp->formType = $parsedSheet->formType;
        $fp->extractedName = $parsedSheet->employeeName;
        $fp->extractedDepartment = $parsedSheet->department;
        $fp->extractedJobTitle = $parsedSheet->jobTitle;
        $fp->extractedLocation = $parsedSheet->location;
        $fp->extractedEmployeeNumber = $parsedSheet->employeeNumber;
        $fp->parsedSheet = $parsedSheet;

        try {
            $fp->parsedGrowthPlan = $this->excelParser->parseGrowthPlansSheet($workbook);
        } catch (\Throwable) {
            // Growth plan parsing failure is non-fatal, matching Django.
        }

        $fp->matchResult = $this->fuzzyMatcher->matchEmployee(
            $parsedSheet->employeeNumber,
            $parsedSheet->employeeName,
            $parsedSheet->department,
            $parsedSheet->jobTitle,
            $parsedSheet->location,
            $employees,
        );

        if ($fp->matchResult->employeeId !== null) {
            $matchedEmp = null;
            foreach ($employees as $emp) {
                if ($emp['id'] === $fp->matchResult->employeeId) {
                    $matchedEmp = $emp;
                    break;
                }
            }
            if ($matchedEmp !== null) {
                $expectedForm = $matchedEmp['classification'] === 'MANAGERIAL' ? 'FORM_A' : 'FORM_B';
                if ($fp->formType !== $expectedForm) {
                    $fp->errors[] = sprintf(
                        'Form type mismatch: file is %s but employee classification expects %s.',
                        $fp->formType,
                        $expectedForm,
                    );
                }
            }
        }

        $kdWeights = array_map(static fn (ParsedKd $kd) => $kd->weight, $parsedSheet->keyDeliverables);
        $kdRatings = array_map(static fn (ParsedKd $kd) => $kd->managerRating, $parsedSheet->keyDeliverables);
        $bcRatings = array_map(static fn (ParsedCompetencyRating $cr) => $cr->managerRating, $parsedSheet->competencyRatings);

        $fp->scoreValidation = $this->scoreValidationService->validate(
            $kdWeights,
            $kdRatings,
            $bcRatings,
            $parsedSheet->documentKdAverage,
            $parsedSheet->documentBcAverage,
            $parsedSheet->documentTotalScore,
        );

        $fp->dataSummary = [
            'kd_count' => count(array_filter($parsedSheet->keyDeliverables, static fn (ParsedKd $kd) => $kd->description !== '')),
            'competency_count' => count(array_filter($parsedSheet->competencyRatings, static fn (ParsedCompetencyRating $cr) => $cr->competencyName !== '')),
            'comments_count' => count(array_filter($parsedSheet->comments, static fn (ParsedComment $c) => $c->content !== '')),
            'has_growth_plan' => $fp->parsedGrowthPlan !== null,
        ];

        return $fp;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function buildEmployeeList(): array
    {
        $list = [];
        foreach ($this->employees->findAllActive() as $emp) {
            $list[] = [
                'id' => (string) $emp->getId(),
                'employee_number' => $emp->getEmployeeNumber(),
                'name' => $emp->getName(),
                'department_name' => $emp->getDepartment()->getName(),
                'job_title' => $emp->getJobTitle(),
                'location' => $emp->getLocation(),
                'classification' => $emp->getClassification()->value,
            ];
        }

        return $list;
    }
}
