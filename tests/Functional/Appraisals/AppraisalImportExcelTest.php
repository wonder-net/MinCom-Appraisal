<?php

declare(strict_types=1);

namespace App\Tests\Functional\Appraisals;

use App\Entity\Appraisal;
use App\Entity\CompetencyRating;
use App\Entity\Employee;
use App\Enum\AppraisalStatus;
use App\Enum\RoleName;
use App\Factory\AppraisalCycleFactory;
use App\Factory\AppraisalFactory;
use App\Factory\CompetencyFactory;
use App\Factory\EmployeeFactory;
use App\Factory\RoleFactory;
use App\Factory\UserFactory;
use App\Repository\AppraisalRepository;
use Doctrine\ORM\EntityManagerInterface;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx as XlsxWriter;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\HttpFoundation\File\UploadedFile;

/**
 * Port of test_import_excel_views.py's core coverage for the
 * single-appraisal `import-excel` action (TASK-064) — status/form-type
 * gating, RBAC, file validation, and the happy path. Audit-log and
 * growth-plan-persistence assertions are omitted (both apps deferred —
 * see AppraisalImportExcelService's class docblock).
 */
final class AppraisalImportExcelTest extends WebTestCase
{
    public function testHrAdminValidImportReturns200(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal, 'competency' => $competency] = $this->makeSelfAssessmentAppraisal();
        $this->addExistingCompetencyRating($appraisal, $competency);
        [$client, $token] = $this->loginAsHrAdmin($client);

        $file = $this->uploadedFormAFile($competency->getName());
        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/import-excel/', server: $this->authHeader($token), files: ['file' => $file]);

        self::assertResponseStatusCodeSame(200);
        $summary = json_decode($client->getResponse()->getContent(), true)['data']['import_summary'];
        self::assertSame(1, $summary['kd_count']);
        self::assertSame(1, $summary['competency_count']);
        self::assertFalse($summary['growth_plan_imported']);
    }

    public function testWrongStatusReturns400(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal, 'competency' => $competency] = $this->makeSelfAssessmentAppraisal(AppraisalStatus::DISCUSSION);
        [$client, $token] = $this->loginAsHrAdmin($client);

        $file = $this->uploadedFormAFile($competency->getName());
        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/import-excel/', server: $this->authHeader($token), files: ['file' => $file]);

        self::assertResponseStatusCodeSame(400);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('IMPORT_NOT_ALLOWED', $body['code']);
    }

    public function testFormTypeMismatchReturns422(): void
    {
        $client = static::createClient();
        // Appraisal is FORM_B (non-managerial) but we upload a FORM_A file.
        $managerEmployee = EmployeeFactory::new()->managerial()->create();
        $employee = EmployeeFactory::new()->create();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $appraisal = AppraisalFactory::new()->create([
            'cycle' => $cycle,
            'employee' => $employee,
            'status' => AppraisalStatus::SELF_ASSESSMENT,
            'formType' => \App\Enum\AppraisalFormType::FORM_B,
        ]);
        static::getContainer()->get(EntityManagerInterface::class)->flush();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $file = $this->uploadedFormAFile('Leadership');
        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/import-excel/', server: $this->authHeader($token), files: ['file' => $file]);

        self::assertResponseStatusCodeSame(422);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('FORM_TYPE_MISMATCH', $body['code']);
    }

    public function testMissingFileReturns400(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeSelfAssessmentAppraisal();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/import-excel/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(400);
    }

    public function testWrongExtensionReturns400(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeSelfAssessmentAppraisal();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $tempPath = tempnam(sys_get_temp_dir(), 'wrong-ext-').'.txt';
        file_put_contents($tempPath, 'not an excel file');
        $file = new UploadedFile($tempPath, 'notes.txt', 'text/plain', null, true);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/import-excel/', server: $this->authHeader($token), files: ['file' => $file]);

        self::assertResponseStatusCodeSame(400);
    }

    public function testOversizedFileReturns413(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeSelfAssessmentAppraisal();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $tempPath = tempnam(sys_get_temp_dir(), 'huge-').'.xls';
        file_put_contents($tempPath, str_repeat('x', 5 * 1024 * 1024 + 1));
        $file = new UploadedFile($tempPath, 'huge.xls', 'application/vnd.ms-excel', null, true);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/import-excel/', server: $this->authHeader($token), files: ['file' => $file]);

        self::assertResponseStatusCodeSame(413);
    }

    public function testManagerCannotImport(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal, 'competency' => $competency] = $this->makeSelfAssessmentAppraisal();
        $manager = UserFactory::new()->withRoles(RoleName::MANAGER)->create();
        $manager->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        static::getContainer()->get(EntityManagerInterface::class)->flush();
        [$client, $token] = $this->login($manager, $client);

        $file = $this->uploadedFormAFile($competency->getName());
        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/import-excel/', server: $this->authHeader($token), files: ['file' => $file]);

        self::assertResponseStatusCodeSame(403);
    }

    public function testNonexistentAppraisalReturns404(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $file = $this->uploadedFormAFile('Leadership');
        $client->request('POST', '/api/v1/appraisals/'.\Symfony\Component\Uid\Uuid::v7().'/import-excel/', server: $this->authHeader($token), files: ['file' => $file]);

        self::assertResponseStatusCodeSame(404);
    }

    public function testInvalidTemplateContentReturns422(): void
    {
        $client = static::createClient();
        ['appraisal' => $appraisal] = $this->makeSelfAssessmentAppraisal();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $tempPath = tempnam(sys_get_temp_dir(), 'bad-content-').'.xls';
        file_put_contents($tempPath, 'this is not a real spreadsheet');
        $file = new UploadedFile($tempPath, 'bad.xls', 'application/vnd.ms-excel', null, true);

        $client->request('POST', '/api/v1/appraisals/'.$appraisal->getId().'/import-excel/', server: $this->authHeader($token), files: ['file' => $file]);

        self::assertResponseStatusCodeSame(422);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('INVALID_TEMPLATE', $body['code']);
    }

    /**
     * @return array{appraisal: Appraisal, competency: \App\Entity\Competency}
     */
    private function makeSelfAssessmentAppraisal(AppraisalStatus $status = AppraisalStatus::SELF_ASSESSMENT): array
    {
        $managerEmployee = EmployeeFactory::new()->managerial()->create();
        $employee = EmployeeFactory::new()->managerial()->withManager($managerEmployee)->create();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $competency = CompetencyFactory::new()->create(['name' => 'Leadership']);

        $appraisal = AppraisalFactory::new()->create([
            'cycle' => $cycle,
            'employee' => $employee,
            'status' => $status,
            'formType' => \App\Enum\AppraisalFormType::FORM_A,
        ]);

        static::getContainer()->get(EntityManagerInterface::class)->flush();

        return ['appraisal' => $appraisal, 'competency' => $competency];
    }

    private function addExistingCompetencyRating(Appraisal $appraisal, \App\Entity\Competency $competency): void
    {
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->persist(new CompetencyRating($appraisal, $competency));
        $em->flush();
    }

    private function uploadedFormAFile(string $competencyName): UploadedFile
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('PerformanceAppraisal');
        $sheet->setCellValue('A1', 'PA: Form A - Managerial');
        $sheet->setCellValue('B3', 'Jane Doe');
        // One KD in the Financial perspective (row 7 0-idx -> excel row 8), weight 1.0 so no warning.
        $sheet->setCellValue('B8', 'Deliver the quarterly report');
        $sheet->setCellValue('C8', 1.0);
        $sheet->setCellValue('D8', 4.0);
        // One competency rating (row 7 0-idx -> excel row 8), col H=name/J=rating.
        $sheet->setCellValue('H8', $competencyName);
        $sheet->setCellValue('J8', 4.0);

        $tempPath = tempnam(sys_get_temp_dir(), 'import-excel-test-').'.xls';
        (new XlsxWriter($spreadsheet))->save($tempPath);

        return new UploadedFile($tempPath, 'appraisal.xls', 'application/vnd.ms-excel', null, true);
    }

    /**
     * @return array{0: KernelBrowser, 1: string}
     */
    private function loginAsHrAdmin(KernelBrowser $client): array
    {
        $user = UserFactory::new()->withRoles(RoleName::HR_ADMIN)->create();
        $user->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        return $this->login($user, $client);
    }

    /**
     * @return array{0: KernelBrowser, 1: string}
     */
    private function login(\App\Entity\User $user, KernelBrowser $client): array
    {
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $freshUser = $em->getRepository(\App\Entity\User::class)->find($user->getId());
        \assert($freshUser instanceof \App\Entity\User);
        $freshUser->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        $em->flush();

        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => $freshUser->getEmail(),
            'password' => UserFactory::DEFAULT_PASSWORD,
        ]));
        $login = json_decode($client->getResponse()->getContent(), true)['data'];

        return [$client, $login['access']];
    }

    /**
     * @return array<string, string>
     */
    private function authHeader(string $accessToken): array
    {
        return ['HTTP_AUTHORIZATION' => 'Bearer '.$accessToken];
    }
}
