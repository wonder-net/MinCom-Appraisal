<?php

declare(strict_types=1);

namespace App\AppraisalImport;

/**
 * Port of appraisal_bulk_import_service.FilePreview. Mutable (unlike
 * the other ports in this namespace) since it mirrors Django's plain
 * dataclass being incrementally populated field-by-field as each
 * parse/match/validate step completes.
 */
final class FilePreview
{
    public string $formType = '';
    public string $extractedName = '';
    public string $extractedDepartment = '';
    public string $extractedJobTitle = '';
    public string $extractedLocation = '';
    public string $extractedEmployeeNumber = '';
    public ?MatchResult $matchResult = null;
    public ?ScoreValidationResult $scoreValidation = null;

    /** @var array<string, mixed> */
    public array $dataSummary = [];

    /** @var list<string> */
    public array $errors = [];

    public ?ParsedAppraisalSheet $parsedSheet = null;
    public ?ParsedGrowthPlan $parsedGrowthPlan = null;

    public function __construct(public readonly string $filename)
    {
    }
}
