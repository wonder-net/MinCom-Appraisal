<?php

declare(strict_types=1);

namespace App\AppraisalImport;

/**
 * Port of services.ImportSummary (the single-appraisal `import-excel`
 * action, TASK-064/065 — distinct from the HR-wide multi-file bulk
 * import in this same namespace).
 */
final class ImportSummary
{
    /**
     * @param list<string> $warnings
     */
    public function __construct(
        public readonly int $kdCount,
        public readonly int $competencyCount,
        public readonly int $commentsImported,
        public readonly array $warnings,
        public readonly bool $growthPlanImported = false,
        public readonly int $strengthsCount = 0,
        public readonly int $weaknessesCount = 0,
        public readonly int $trainingNeedsCount = 0,
    ) {
    }
}
