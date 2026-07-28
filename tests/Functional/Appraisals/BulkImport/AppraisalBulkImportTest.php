<?php

declare(strict_types=1);

namespace App\Tests\Functional\Appraisals\BulkImport;

use App\Entity\User;
use App\Enum\AppraisalStatus;
use App\Enum\RoleName;
use App\Factory\AppraisalCycleFactory;
use App\Factory\EmployeeFactory;
use App\Factory\UserFactory;
use App\MessageHandler\ExecuteAppraisalBulkImportMessageHandler;
use App\Message\ExecuteAppraisalBulkImportMessage;
use App\Repository\AppraisalRepository;
use Doctrine\ORM\EntityManagerInterface;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx as XlsxWriter;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\HttpFoundation\File\UploadedFile;

/**
 * Port of the HR-wide multi-file bulk-import flow (validate -> confirm
 * -> results), the newer TASK-149/153/154/156 feature living alongside
 * the older single-appraisal import-excel action covered by
 * AppraisalImportExcelTest. Dispatches
 * ExecuteAppraisalBulkImportMessageHandler directly (fetched from the
 * container), mirroring the established pattern for Messenger-based
 * async jobs in this codebase (see BulkImportTest.php's user-import
 * equivalent) rather than relying on the (Doctrine-backed) async
 * transport actually being consumed in tests.
 */
final class AppraisalBulkImportTest extends WebTestCase
{
    public function testValidateMissingFieldsReturns400(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $client->request('POST', '/api/v1/appraisals/bulk-import/validate/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(400);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertArrayHasKey('file', $body['detail']);
        self::assertArrayHasKey('cycle_id', $body['detail']);
        self::assertArrayHasKey('target_status', $body['detail']);
    }

    public function testValidateWithInactiveCycleReturns400(): void
    {
        $client = static::createClient();
        $cycle = AppraisalCycleFactory::new()->closed()->create();
        static::getContainer()->get(EntityManagerInterface::class)->flush();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $file = $this->uploadedFile('EMP999', 'Nobody');
        $client->request('POST', '/api/v1/appraisals/bulk-import/validate/', server: $this->authHeader($token), parameters: [
            'cycle_id' => (string) $cycle->getId(),
            'target_status' => 'DISCUSSION',
        ], files: ['file' => $file]);

        self::assertResponseStatusCodeSame(400);
    }

    public function testValidateExactMatchByEmployeeNumber(): void
    {
        $client = static::createClient();
        $employee = EmployeeFactory::new()->managerial()->create(['employeeNumber' => 'EMP777']);
        $cycle = AppraisalCycleFactory::new()->active()->create();
        static::getContainer()->get(EntityManagerInterface::class)->flush();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $file = $this->uploadedFile('EMP777', $employee->getName());
        $client->request('POST', '/api/v1/appraisals/bulk-import/validate/', server: $this->authHeader($token), parameters: [
            'cycle_id' => (string) $cycle->getId(),
            'target_status' => 'DISCUSSION',
        ], files: ['file' => $file]);

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertNotNull($body['import_id']);
        self::assertSame(1, $body['summary']['total_files']);
        self::assertSame(1, $body['summary']['matched']);
        self::assertSame('exact', $body['files'][0]['match_status']);
        self::assertSame((string) $employee->getId(), $body['files'][0]['matched_employee']['id']);
    }

    public function testFullLifecycleConfirmExecutesImport(): void
    {
        $client = static::createClient();
        $employee = EmployeeFactory::new()->managerial()->create(['employeeNumber' => 'EMP321']);
        $cycle = AppraisalCycleFactory::new()->active()->create();
        static::getContainer()->get(EntityManagerInterface::class)->flush();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $filename = 'appraisal_EMP321.xls';
        $file = $this->uploadedFile('EMP321', $employee->getName(), $filename);
        $client->request('POST', '/api/v1/appraisals/bulk-import/validate/', server: $this->authHeader($token), parameters: [
            'cycle_id' => (string) $cycle->getId(),
            'target_status' => 'DISCUSSION',
        ], files: ['file' => $file]);
        self::assertResponseStatusCodeSame(200);
        $validateBody = json_decode($client->getResponse()->getContent(), true)['data'];
        $importId = $validateBody['import_id'];

        $client->request('POST', '/api/v1/appraisals/bulk-import/'.$importId.'/confirm/', server: $this->authHeader($token), content: json_encode([
            'confirmed_matches' => [$filename => (string) $employee->getId()],
        ]));
        self::assertResponseStatusCodeSame(202);
        $confirmBody = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('queued', $confirmBody['status']);

        static::getContainer()->get(ExecuteAppraisalBulkImportMessageHandler::class)(new ExecuteAppraisalBulkImportMessage($importId));

        $client->request('GET', '/api/v1/appraisals/bulk-import/'.$importId.'/results/', server: $this->authHeader($token));
        self::assertResponseStatusCodeSame(200);
        $results = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('COMPLETED', $results['status']);
        self::assertSame(1, $results['imported_count']);
        self::assertSame(0, $results['failed_count']);

        $em = static::getContainer()->get(EntityManagerInterface::class);
        $refreshedEmployee = $em->getRepository(\App\Entity\Employee::class)->find($employee->getId());
        \assert($refreshedEmployee instanceof \App\Entity\Employee);
        /** @var AppraisalRepository $appraisals */
        $appraisals = static::getContainer()->get(AppraisalRepository::class);
        $appraisal = $appraisals->findOneByCycleAndEmployee($cycle, $refreshedEmployee);
        self::assertNotNull($appraisal);
        self::assertSame(AppraisalStatus::DISCUSSION, $appraisal->getStatus());
    }

    public function testConfirmRejectsWrongOwner(): void
    {
        $client = static::createClient();
        $employee = EmployeeFactory::new()->create(['employeeNumber' => 'EMP555']);
        $cycle = AppraisalCycleFactory::new()->active()->create();
        static::getContainer()->get(EntityManagerInterface::class)->flush();
        [$client, $ownerToken] = $this->loginAsHrAdmin($client);

        $filename = 'appraisal.xls';
        $file = $this->uploadedFile('EMP555', $employee->getName(), $filename);
        $client->request('POST', '/api/v1/appraisals/bulk-import/validate/', server: $this->authHeader($ownerToken), parameters: [
            'cycle_id' => (string) $cycle->getId(),
            'target_status' => 'DISCUSSION',
        ], files: ['file' => $file]);
        $importId = json_decode($client->getResponse()->getContent(), true)['data']['import_id'];

        [$client, $otherToken] = $this->loginAsHrAdmin($client);
        $client->request('POST', '/api/v1/appraisals/bulk-import/'.$importId.'/confirm/', server: $this->authHeader($otherToken), content: json_encode([
            'confirmed_matches' => [$filename => (string) $employee->getId()],
        ]));

        self::assertResponseStatusCodeSame(404);
    }

    public function testConfirmRejectsEmptyConfirmedMatches(): void
    {
        $client = static::createClient();
        $employee = EmployeeFactory::new()->create(['employeeNumber' => 'EMP444']);
        $cycle = AppraisalCycleFactory::new()->active()->create();
        static::getContainer()->get(EntityManagerInterface::class)->flush();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $filename = 'appraisal.xls';
        $file = $this->uploadedFile('EMP444', $employee->getName(), $filename);
        $client->request('POST', '/api/v1/appraisals/bulk-import/validate/', server: $this->authHeader($token), parameters: [
            'cycle_id' => (string) $cycle->getId(),
            'target_status' => 'DISCUSSION',
        ], files: ['file' => $file]);
        $importId = json_decode($client->getResponse()->getContent(), true)['data']['import_id'];

        $client->request('POST', '/api/v1/appraisals/bulk-import/'.$importId.'/confirm/', server: $this->authHeader($token), content: json_encode(['confirmed_matches' => []]));

        self::assertResponseStatusCodeSame(400);
    }

    public function testTemplateDownloadReturnsBinaryXlsx(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $client->request('GET', '/api/v1/appraisals/templates/form-a/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        self::assertSame('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', $client->getResponse()->headers->get('Content-Type'));
        self::assertStringContainsString('MINCOM_PA_Template_Managerial.xlsx', (string) $client->getResponse()->headers->get('Content-Disposition'));
    }

    public function testTemplateDownloadInvalidFormTypeReturns400(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsHrAdmin($client);

        $client->request('GET', '/api/v1/appraisals/templates/form-c/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(400);
    }

    private function uploadedFile(string $employeeNumber, string $employeeName, string $filename = 'appraisal.xls'): UploadedFile
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('PerformanceAppraisal');
        $sheet->setCellValue('A1', 'PA: Form A - Managerial');
        $sheet->setCellValue('A2', 'Employee Number');
        $sheet->setCellValue('B2', $employeeNumber);
        $sheet->setCellValue('B3', $employeeName);
        $sheet->setCellValue('B8', 'Deliver the quarterly report');
        $sheet->setCellValue('C8', 1.0);
        $sheet->setCellValue('D8', 4.0);

        $tempPath = tempnam(sys_get_temp_dir(), 'bulk-import-test-').'.xls';
        (new XlsxWriter($spreadsheet))->save($tempPath);

        return new UploadedFile($tempPath, $filename, 'application/vnd.ms-excel', null, true);
    }

    /**
     * @return array{0: KernelBrowser, 1: string}
     */
    private function loginAsHrAdmin(KernelBrowser $client): array
    {
        $user = UserFactory::new()->withRoles(RoleName::HR_ADMIN)->create();
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        return $this->login($user, $client);
    }

    /**
     * @return array{0: KernelBrowser, 1: string}
     */
    private function login(User $user, KernelBrowser $client): array
    {
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $freshUser = $em->getRepository(User::class)->find($user->getId());
        \assert($freshUser instanceof User);
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
