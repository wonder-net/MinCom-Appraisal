<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Entity\Appraisal;
use App\Entity\CareerPlan;
use App\Entity\Comment;
use App\Entity\DevelopmentNeed;
use App\Entity\Employee;
use App\Entity\GrowthPlan;
use App\Entity\StrengthWeakness;
use App\Entity\TrainingNeed;
use App\Entity\User;
use App\Entity\UserBulkImportJob;
use App\Enum\GrowthPlanPriority;
use App\Enum\StrengthWeaknessType;
use App\Enum\TrainingNeedPriority;
use App\Enum\TrainingNeedType;
use App\Factory\AppraisalFactory;
use App\Factory\CommentFactory;
use App\Factory\EmployeeFactory;
use App\Factory\UserFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

/**
 * Proves the 12 fields Django encrypts at rest (backend/utils/encryption.py's
 * ENCRYPTED_MODEL_FIELDS + the two escalation_reason/UserBulkImportJob
 * fields the registry omits — see plan doc) are genuinely ciphertext in
 * the database, not just round-tripping through an inert Doctrine Type:
 * each test persists a real value, clears the entity manager, re-fetches
 * via the repository (proving decrypt-on-read), AND reads the raw
 * column value via a direct DBAL query (proving it's NOT the plaintext
 * at rest).
 */
final class EncryptionAtRestTest extends KernelTestCase
{
    public function testEmployeeNameIsEncryptedAtRest(): void
    {
        $employee = EmployeeFactory::new()->create(['name' => 'Jane Doe']);
        $this->flush();
        $id = (string) $employee->getId();
        $this->em()->clear();

        self::assertNotSame('Jane Doe', $this->rawColumn('employee', 'name', $id));

        $refetched = $this->em()->getRepository(Employee::class)->find($id);
        self::assertSame('Jane Doe', $refetched->getName());
    }

    public function testUserFullNameAndMfaSecretAreEncryptedAtRest(): void
    {
        $user = UserFactory::new()->create(['fullName' => 'Alice Example']);
        $user->setMfaSecret('JBSWY3DPEHPK3PXP');
        $this->flush();
        $id = (string) $user->getId();
        $this->em()->clear();

        self::assertNotSame('Alice Example', $this->rawColumn('`user`', 'full_name', $id));
        self::assertNotSame('JBSWY3DPEHPK3PXP', $this->rawColumn('`user`', 'mfa_secret', $id));

        $refetched = $this->em()->getRepository(User::class)->find($id);
        self::assertSame('Alice Example', $refetched->getFullName());
        self::assertSame('JBSWY3DPEHPK3PXP', $refetched->getMfaSecret());
    }

    public function testCommentContentIsEncryptedAtRest(): void
    {
        $comment = CommentFactory::new()->create(['content' => 'This is a sensitive review comment.']);
        $this->flush();
        $id = (string) $comment->getId();
        $this->em()->clear();

        self::assertNotSame('This is a sensitive review comment.', $this->rawColumn('appraisal_comment', 'content', $id));

        $refetched = $this->em()->getRepository(Comment::class)->find($id);
        self::assertSame('This is a sensitive review comment.', $refetched->getContent());
    }

    public function testAppraisalEscalationReasonIsEncryptedAtRest(): void
    {
        $appraisal = AppraisalFactory::new()->create();
        $appraisal->setEscalationReason('The employee disputed the rating.');
        $this->flush();
        $id = (string) $appraisal->getId();
        $this->em()->clear();

        self::assertNotSame('The employee disputed the rating.', $this->rawColumn('appraisal', 'escalation_reason', $id));

        $refetched = $this->em()->getRepository(Appraisal::class)->find($id);
        self::assertSame('The employee disputed the rating.', $refetched->getEscalationReason());
    }

    public function testGrowthPlanOverallAssessmentIsEncryptedAtRest(): void
    {
        $appraisal = AppraisalFactory::new()->create();
        $growthPlan = new GrowthPlan($appraisal, 'Strong performance this cycle.');
        $this->em()->persist($growthPlan);
        $this->flush();
        $id = (string) $growthPlan->getId();
        $this->em()->clear();

        self::assertNotSame('Strong performance this cycle.', $this->rawColumn('growth_plan', 'overall_assessment', $id));

        $refetched = $this->em()->getRepository(GrowthPlan::class)->find($id);
        self::assertSame('Strong performance this cycle.', $refetched->getOverallAssessment());
    }

    public function testStrengthWeaknessDescriptionIsEncryptedAtRest(): void
    {
        $growthPlan = $this->createGrowthPlan();
        $sw = new StrengthWeakness($growthPlan, StrengthWeaknessType::STRENGTH, 'Excellent communication skills.');
        $this->em()->persist($sw);
        $this->flush();
        $id = (string) $sw->getId();
        $this->em()->clear();

        self::assertNotSame('Excellent communication skills.', $this->rawColumn('growth_plan_strength_weakness', 'description', $id));

        $refetched = $this->em()->getRepository(StrengthWeakness::class)->find($id);
        self::assertSame('Excellent communication skills.', $refetched->getDescription());
    }

    public function testTrainingNeedDescriptionIsEncryptedAtRest(): void
    {
        $growthPlan = $this->createGrowthPlan();
        $need = new TrainingNeed($growthPlan, TrainingNeedType::ON_THE_JOB, 'Needs advanced SQL training.', TrainingNeedPriority::FIRST);
        $this->em()->persist($need);
        $this->flush();
        $id = (string) $need->getId();
        $this->em()->clear();

        self::assertNotSame('Needs advanced SQL training.', $this->rawColumn('growth_plan_training_need', 'description', $id));

        $refetched = $this->em()->getRepository(TrainingNeed::class)->find($id);
        self::assertSame('Needs advanced SQL training.', $refetched->getDescription());
    }

    public function testCareerPlanAspiredRoleIsEncryptedAtRest(): void
    {
        $growthPlan = $this->createGrowthPlan();
        $careerPlan = new CareerPlan($growthPlan, 'Senior Software Engineer');
        $this->em()->persist($careerPlan);
        $this->flush();
        $id = (string) $careerPlan->getId();
        $this->em()->clear();

        self::assertNotSame('Senior Software Engineer', $this->rawColumn('growth_plan_career_plan', 'aspired_role', $id));

        $refetched = $this->em()->getRepository(CareerPlan::class)->find($id);
        self::assertSame('Senior Software Engineer', $refetched->getAspiredRole());
    }

    public function testDevelopmentNeedDescriptionIsEncryptedAtRest(): void
    {
        $growthPlan = $this->createGrowthPlan();
        $need = new DevelopmentNeed($growthPlan, 'Take on a mentorship role.', GrowthPlanPriority::SECOND);
        $this->em()->persist($need);
        $this->flush();
        $id = (string) $need->getId();
        $this->em()->clear();

        self::assertNotSame('Take on a mentorship role.', $this->rawColumn('growth_plan_development_need', 'description', $id));

        $refetched = $this->em()->getRepository(DevelopmentNeed::class)->find($id);
        self::assertSame('Take on a mentorship role.', $refetched->getDescription());
    }

    public function testUserBulkImportJobJsonFieldsAreEncryptedAtRest(): void
    {
        $user = UserFactory::new()->create();
        $job = new UserBulkImportJob($user, 'users.csv', '/tmp/users.csv');
        $job->setValidationPreview(['rows' => [['name' => 'Jane Doe', 'email' => 'jane@example.com']]]);
        $job->setFailedRows([['row' => 2, 'error' => 'Duplicate email']]);
        $this->em()->persist($job);
        $this->flush();
        $id = (string) $job->getId();
        $this->em()->clear();

        $rawPreview = $this->rawColumn('user_bulk_import_job', 'validation_preview', $id);
        self::assertStringNotContainsString('Jane Doe', $rawPreview);
        self::assertStringNotContainsString('jane@example.com', $rawPreview);
        $rawFailedRows = $this->rawColumn('user_bulk_import_job', 'failed_rows', $id);
        self::assertStringNotContainsString('Duplicate email', $rawFailedRows);

        $refetched = $this->em()->getRepository(UserBulkImportJob::class)->find($id);
        self::assertSame(['rows' => [['name' => 'Jane Doe', 'email' => 'jane@example.com']]], $refetched->getValidationPreview());
        self::assertSame([['row' => 2, 'error' => 'Duplicate email']], $refetched->getFailedRows());
    }

    private function createGrowthPlan(): GrowthPlan
    {
        $appraisal = AppraisalFactory::new()->create();
        $growthPlan = new GrowthPlan($appraisal);
        $this->em()->persist($growthPlan);
        $this->flush();

        return $growthPlan;
    }

    private function rawColumn(string $table, string $column, string $id): string
    {
        $value = $this->em()->getConnection()->fetchOne(
            sprintf('SELECT %s FROM %s WHERE id = :id', $column, $table),
            ['id' => $id],
        );

        return (string) $value;
    }

    private function em(): EntityManagerInterface
    {
        return self::getContainer()->get(EntityManagerInterface::class);
    }

    private function flush(): void
    {
        $this->em()->flush();
    }

    protected function setUp(): void
    {
        self::bootKernel();
    }
}
