<?php

declare(strict_types=1);

namespace App\AppraisalImport;

/**
 * Port of employee_matching.{match_employee, match_competency_name,
 * _compute_match_score}.
 *
 * Django's implementation uses the rapidfuzz library's
 * `token_sort_ratio` (tokenize on whitespace, sort tokens, then compute
 * an edit-distance-based similarity ratio). rapidfuzz has no PHP
 * equivalent and pulling in a new extension/package for a single
 * heuristic isn't warranted — per the Milestone 1 decision to avoid an
 * external fuzzy-match dependency, `tokenSortRatio()` below reproduces
 * the same "sort tokens, then compare" shape using PHP's built-in
 * `similar_text()` for the underlying similarity measure. The exact
 * scores won't match rapidfuzz digit-for-digit, but the match/suggest/
 * unmatched buckets these thresholds feed are reviewed by an HR Admin
 * in the import preview UI, not applied automatically — an
 * approximation that lands in the same bucket for realistic inputs is
 * sufficient.
 */
final class FuzzyMatcher
{
    public const AUTO_MATCH_THRESHOLD = 85;
    public const SUGGESTED_MATCH_THRESHOLD = 60;
    public const COMPETENCY_MATCH_THRESHOLD = 80;

    private const NAME_WEIGHT = 0.40;
    private const DEPARTMENT_WEIGHT = 0.25;
    private const JOB_TITLE_WEIGHT = 0.20;
    private const LOCATION_WEIGHT = 0.15;

    /**
     * @param list<array<string, mixed>> $employees
     */
    public function matchEmployee(
        string $employeeNumber,
        string $name,
        string $department,
        string $jobTitle,
        string $location,
        array $employees,
    ): MatchResult {
        if ($employeeNumber !== '') {
            foreach ($employees as $emp) {
                if (trim((string) ($emp['employee_number'] ?? '')) === trim($employeeNumber)) {
                    return new MatchResult(
                        matchType: 'exact',
                        confidence: 100,
                        employeeId: (string) $emp['id'],
                        employeeNumber: (string) $emp['employee_number'],
                        employeeName: (string) ($emp['name'] ?? ''),
                    );
                }
            }
        }

        if ($name === '') {
            return new MatchResult(matchType: 'unmatched', confidence: 0);
        }

        $scored = [];
        foreach ($employees as $emp) {
            $score = $this->computeMatchScore(
                $name,
                $department,
                $jobTitle,
                $location,
                (string) ($emp['name'] ?? ''),
                (string) ($emp['department_name'] ?? ''),
                (string) ($emp['job_title'] ?? ''),
                (string) ($emp['location'] ?? ''),
            );
            if ($score >= self::SUGGESTED_MATCH_THRESHOLD) {
                $scored[] = new MatchCandidate(
                    employeeId: (string) $emp['id'],
                    employeeNumber: (string) ($emp['employee_number'] ?? ''),
                    name: (string) ($emp['name'] ?? ''),
                    department: (string) ($emp['department_name'] ?? ''),
                    jobTitle: (string) ($emp['job_title'] ?? ''),
                    score: $score,
                );
            }
        }

        usort($scored, static fn (MatchCandidate $a, MatchCandidate $b) => $b->score <=> $a->score);

        if ($scored === []) {
            return new MatchResult(matchType: 'unmatched', confidence: 0);
        }

        $best = $scored[0];
        $matchType = $best->score >= self::AUTO_MATCH_THRESHOLD ? 'auto' : 'suggested';

        return new MatchResult(
            matchType: $matchType,
            confidence: $best->score,
            employeeId: $best->employeeId,
            employeeNumber: $best->employeeNumber,
            employeeName: $best->name,
            candidates: array_slice($scored, 0, 5),
        );
    }

    /**
     * @param list<array{id: string, name: string}> $systemCompetencies
     * @return array{id: string, name: string}|null
     */
    public function matchCompetencyName(string $fileName, array $systemCompetencies): ?array
    {
        $fileName = trim($fileName);
        if ($fileName === '') {
            return null;
        }

        $bestMatch = null;
        $bestScore = 0;

        foreach ($systemCompetencies as $comp) {
            $score = $this->tokenSortRatio(strtolower($fileName), strtolower(trim((string) $comp['name'])));
            if ($score > $bestScore) {
                $bestScore = $score;
                $bestMatch = $comp;
            }
        }

        return $bestScore >= self::COMPETENCY_MATCH_THRESHOLD ? $bestMatch : null;
    }

    private function computeMatchScore(
        string $fileName,
        string $fileDept,
        string $fileTitle,
        string $fileLocation,
        string $empName,
        string $empDept,
        string $empTitle,
        string $empLocation,
    ): int {
        $nameScore = ($fileName !== '' && $empName !== '')
            ? $this->tokenSortRatio(strtolower($fileName), strtolower($empName))
            : 0;

        $deptScore = ($fileDept !== '' && $empDept !== '' && strtolower(trim($fileDept)) === strtolower(trim($empDept))) ? 100 : 0;

        $titleScore = ($fileTitle !== '' && $empTitle !== '')
            ? $this->tokenSortRatio(strtolower($fileTitle), strtolower($empTitle))
            : 0;

        $locationScore = ($fileLocation !== '' && $empLocation !== '' && strtolower(trim($fileLocation)) === strtolower(trim($empLocation))) ? 100 : 0;

        $weighted = $nameScore * self::NAME_WEIGHT
            + $deptScore * self::DEPARTMENT_WEIGHT
            + $titleScore * self::JOB_TITLE_WEIGHT
            + $locationScore * self::LOCATION_WEIGHT;

        return (int) round($weighted);
    }

    private function tokenSortRatio(string $a, string $b): int
    {
        $sortTokens = static function (string $s): string {
            $tokens = preg_split('/\s+/', trim($s), -1, PREG_SPLIT_NO_EMPTY);
            sort($tokens, SORT_STRING);

            return implode(' ', $tokens);
        };

        $sa = $sortTokens($a);
        $sb = $sortTokens($b);

        if ($sa === '' || $sb === '') {
            return 0;
        }

        similar_text($sa, $sb, $percent);

        return (int) round($percent);
    }
}
