<?php

declare(strict_types=1);

namespace App\Tests\Unit\GrowthPlan;

use App\GrowthPlan\GrowthPlanWriteValidator;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;

final class GrowthPlanWriteValidatorTest extends TestCase
{
    public function testAbsentKeysAreNotFlaggedPresent(): void
    {
        $validator = new GrowthPlanWriteValidator();
        $data = $validator->validate([]);

        self::assertFalse($data->hasOverallAssessment);
        self::assertFalse($data->hasStrengthsWeaknesses);
        self::assertFalse($data->hasTrainingNeeds);
        self::assertFalse($data->hasCareerPlans);
        self::assertFalse($data->hasDevelopmentNeeds);
    }

    public function testBlankDescriptionRowIsDroppedNotErrored(): void
    {
        $validator = new GrowthPlanWriteValidator();
        $data = $validator->validate([
            'strengths_weaknesses' => [
                ['type' => 'STRENGTH', 'description' => '   '],
                ['type' => 'STRENGTH', 'description' => 'Real one'],
            ],
        ]);

        self::assertCount(1, $data->strengthsWeaknesses);
        self::assertSame('Real one', $data->strengthsWeaknesses[0]->description);
    }

    public function testDuplicateTrainingNeedPriorityWithinTypeThrows(): void
    {
        $validator = new GrowthPlanWriteValidator();

        $this->expectException(UnprocessableEntityHttpException::class);
        $validator->validate([
            'training_needs' => [
                ['type' => 'ON_THE_JOB', 'description' => 'A', 'priority' => 'FIRST'],
                ['type' => 'ON_THE_JOB', 'description' => 'B', 'priority' => 'FIRST'],
            ],
        ]);
    }

    public function testSameCorrelatingPriorityAcrossDifferentTypesIsAllowed(): void
    {
        $validator = new GrowthPlanWriteValidator();
        $data = $validator->validate([
            'training_needs' => [
                ['type' => 'ON_THE_JOB', 'description' => 'A', 'priority' => 'FIRST'],
                ['type' => 'RECOMMENDED_COURSE', 'description' => 'B', 'priority' => 'FIRST'],
            ],
        ]);

        self::assertCount(2, $data->trainingNeeds);
    }

    public function testCareerPlanAllowsBlankPriority(): void
    {
        $validator = new GrowthPlanWriteValidator();
        $data = $validator->validate([
            'career_plans' => [
                ['aspired_role' => 'VP Engineering'],
            ],
        ]);

        self::assertCount(1, $data->careerPlans);
        self::assertSame('', $data->careerPlans[0]->priority);
    }

    public function testCareerPlanRejectsInvalidNonBlankPriority(): void
    {
        $validator = new GrowthPlanWriteValidator();

        $this->expectException(UnprocessableEntityHttpException::class);
        $validator->validate([
            'career_plans' => [
                ['aspired_role' => 'VP Engineering', 'priority' => 'FIFTH'],
            ],
        ]);
    }

    public function testDevelopmentNeedRequiresValidPriority(): void
    {
        $validator = new GrowthPlanWriteValidator();

        $this->expectException(UnprocessableEntityHttpException::class);
        $validator->validate([
            'development_needs' => [
                ['description' => 'Improve public speaking', 'priority' => 'NOT_A_PRIORITY'],
            ],
        ]);
    }

    public function testInvalidTrainingNeedTypeIsRejected(): void
    {
        $validator = new GrowthPlanWriteValidator();

        $this->expectException(UnprocessableEntityHttpException::class);
        $validator->validate([
            'training_needs' => [
                ['type' => 'NOT_A_TYPE', 'description' => 'A', 'priority' => 'FIRST'],
            ],
        ]);
    }
}
