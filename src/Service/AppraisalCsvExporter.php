<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Appraisal;
use App\Entity\AppraisalCycle;
use App\Enum\AppraisalFormType;
use App\Repository\AppraisalRepository;

/**
 * Port of apps.reports.views.{BulkCSVExportView, _build_csv_row,
 * _csv_row_generator, _humanize_form_type, _format_decimal_or_empty}.
 * Audit logging (Django's AuditService.log("report.csv_export", ...))
 * is intentionally omitted — the `audit` app is last on the port
 * roadmap and doesn't exist yet (same precedent as LoginController).
 */
final class AppraisalCsvExporter
{
    private const COLUMNS = [
        'appraisal_id',
        'employee_number',
        'employee_name',
        'department',
        'form_type',
        'status',
        'total_score',
        'kd_average_score',
        'bc_average_score',
        'performance_descriptor',
        'cycle_name',
    ];

    /**
     * Deliberately not using AppraisalStatus::label() for form_type —
     * stakeholders requested only the bare classification text, not
     * Django's fuller "Form A (Managerial)" display label.
     */
    private const FORM_TYPE_DISPLAY = [
        'FORM_A' => 'Managerial',
        'FORM_B' => 'Non-Managerial',
    ];

    public function __construct(private readonly AppraisalRepository $appraisals)
    {
    }

    /**
     * Writes the CSV (header + data rows) directly to the given stream
     * resource (typically php://output inside a StreamedResponse
     * callback), flushing after each row for true streaming.
     *
     * @param resource $stream
     */
    public function writeTo($stream, AppraisalCycle $cycle): void
    {
        fputcsv($stream, self::COLUMNS);

        foreach ($this->appraisals->findFinalisedByCycleOrderedByEmployeeNumber($cycle) as $appraisal) {
            fputcsv($stream, $this->buildRow($appraisal));
        }
    }

    /**
     * @return list<string>
     */
    private function buildRow(Appraisal $appraisal): array
    {
        $employee = $appraisal->getEmployee();

        return [
            (string) $appraisal->getId(),
            $employee->getEmployeeNumber(),
            $employee->getName(),
            $employee->getDepartment()->getName(),
            $this->humanizeFormType($appraisal->getFormType()),
            $appraisal->getStatus()->label(),
            $appraisal->getTotalScore() ?? '',
            $appraisal->getKdAverageScore() ?? '',
            $appraisal->getBcAverageScore() ?? '',
            $appraisal->getPerformanceDescriptor() ?? '',
            $appraisal->getCycle()->getPeriodName(),
        ];
    }

    private function humanizeFormType(AppraisalFormType $formType): string
    {
        return self::FORM_TYPE_DISPLAY[$formType->value] ?? $formType->value;
    }
}
