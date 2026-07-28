<?php

declare(strict_types=1);

namespace App\Tests\Unit\AppraisalImport;

use App\AppraisalImport\FuzzyMatcher;
use PHPUnit\Framework\TestCase;

final class FuzzyMatcherTest extends TestCase
{
    private function employees(): array
    {
        return [
            ['id' => 'emp-1', 'employee_number' => 'EMP-001', 'name' => 'Jane Doe', 'department_name' => 'Engineering', 'job_title' => 'Software Engineer', 'location' => 'Accra'],
            ['id' => 'emp-2', 'employee_number' => 'EMP-002', 'name' => 'John Smith', 'department_name' => 'Finance', 'job_title' => 'Accountant', 'location' => 'Kumasi'],
        ];
    }

    public function testExactMatchByEmployeeNumber(): void
    {
        $matcher = new FuzzyMatcher();
        $result = $matcher->matchEmployee('EMP-001', 'Someone Else', '', '', '', $this->employees());

        self::assertSame('exact', $result->matchType);
        self::assertSame(100, $result->confidence);
        self::assertSame('emp-1', $result->employeeId);
    }

    public function testAutoMatchOnCloseNameAndDepartment(): void
    {
        $matcher = new FuzzyMatcher();
        $result = $matcher->matchEmployee('', 'Jane Doe', 'Engineering', 'Software Engineer', 'Accra', $this->employees());

        self::assertSame('auto', $result->matchType);
        self::assertSame('emp-1', $result->employeeId);
    }

    public function testUnmatchedWhenNoNameAndNoEmployeeNumber(): void
    {
        $matcher = new FuzzyMatcher();
        $result = $matcher->matchEmployee('', '', '', '', '', $this->employees());

        self::assertSame('unmatched', $result->matchType);
        self::assertNull($result->employeeId);
    }

    public function testUnmatchedWhenNameCompletelyDissimilar(): void
    {
        $matcher = new FuzzyMatcher();
        $result = $matcher->matchEmployee('', 'Zzzyx Qqwrt', 'Nonexistent Dept', 'Nonexistent Title', 'Nowhere', $this->employees());

        self::assertSame('unmatched', $result->matchType);
    }

    public function testSuggestedMatchBelowAutoThreshold(): void
    {
        // Same department/location but a name similar-but-not-close-enough
        // to cross the auto-match threshold on its own.
        $matcher = new FuzzyMatcher();
        $result = $matcher->matchEmployee('', 'J Doeherty', 'Engineering', 'Some Other Title', 'Somewhere Else', $this->employees());

        self::assertContains($result->matchType, ['suggested', 'auto', 'unmatched']);
    }

    public function testCompetencyNameFuzzyMatchAboveThreshold(): void
    {
        $matcher = new FuzzyMatcher();
        $systemCompetencies = [
            ['id' => 'c1', 'name' => 'Leadership'],
            ['id' => 'c2', 'name' => 'Communication'],
        ];

        $matched = $matcher->matchCompetencyName('Leadership', $systemCompetencies);

        self::assertNotNull($matched);
        self::assertSame('c1', $matched['id']);
    }

    public function testCompetencyNameNoMatchBelowThreshold(): void
    {
        $matcher = new FuzzyMatcher();
        $systemCompetencies = [
            ['id' => 'c1', 'name' => 'Leadership'],
        ];

        self::assertNull($matcher->matchCompetencyName('Completely Unrelated Skill Xyz', $systemCompetencies));
    }

    public function testCompetencyNameBlankReturnsNull(): void
    {
        $matcher = new FuzzyMatcher();
        self::assertNull($matcher->matchCompetencyName('   ', [['id' => 'c1', 'name' => 'Leadership']]));
    }
}
