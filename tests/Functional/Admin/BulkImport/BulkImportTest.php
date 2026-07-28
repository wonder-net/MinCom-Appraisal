<?php

declare(strict_types=1);

namespace App\Tests\Functional\Admin\BulkImport;

use App\Enum\RoleName;
use App\Factory\DepartmentFactory;
use App\Factory\EmployeeFactory;
use App\Factory\RoleFactory;
use App\Factory\UserFactory;
use App\Message\CommitUserBulkImportMessage;
use App\Message\ExecuteBulkImportMessage;
use App\Message\ValidateUserBulkImportMessage;
use App\MessageHandler\CommitUserBulkImportMessageHandler;
use App\MessageHandler\ExecuteBulkImportMessageHandler;
use App\MessageHandler\ValidateUserBulkImportMessageHandler;
use App\Repository\DepartmentRepository;
use App\Repository\EmployeeRepository;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx as XlsxWriter;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\HttpFoundation\File\UploadedFile;

final class BulkImportTest extends WebTestCase
{
    private const HEADERS = [
        'employee_number', 'full_name', 'email', 'job_title', 'department',
        'job_family', 'location', 'appraisor_employee_number', 'roles',
    ];

    public function testNonAdminCannotUploadForValidation(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::EMPLOYEE);
        $upload = $this->buildXlsxUpload([
            ['EMP-001', 'Jane Doe', 'jane@example.com', 'Engineer', 'IT', '', 'Accra', '', 'EMPLOYEE'],
        ]);

        $client->request('POST', '/api/v1/admin/users/bulk-import/validate/', server: $this->authHeader($accessToken), files: ['file' => $upload]);
        self::assertResponseStatusCodeSame(403);
    }

    public function testLegacyValidateThenConfirmCreatesUsers(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $upload = $this->buildXlsxUpload([
            ['EMP-101', 'Ama Owusu', 'ama.owusu@example.com', 'Analyst', 'Finance', '', 'Accra', '', 'EMPLOYEE'],
            ['EMP-102', 'Kojo Mensah', 'kojo.mensah@example.com', 'Manager', 'Finance', '', 'Accra', 'EMP-101', 'MANAGER'],
        ]);

        $client->request('POST', '/api/v1/admin/users/bulk-import/validate/', server: $this->authHeader($accessToken), files: ['file' => $upload]);
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertNotNull($body['import_id']);
        self::assertCount(2, $body['valid_rows']);
        self::assertCount(0, $body['error_rows']);
        self::assertSame(2, $body['valid_count']);

        $importId = $body['import_id'];

        $client->request('POST', "/api/v1/admin/users/bulk-import/{$importId}/confirm/", server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(202);
        self::assertSame('processing', json_decode($client->getResponse()->getContent(), true)['data']['status']);

        // Simulate the worker consuming the queued message.
        static::getContainer()->get(ExecuteBulkImportMessageHandler::class)(new ExecuteBulkImportMessage($importId));

        $client->request('GET', "/api/v1/admin/users/bulk-import/{$importId}/results/", server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $results = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('COMPLETED', $results['status']);
        self::assertSame(2, $results['created_count']);
        self::assertSame(0, $results['failed_count']);

        /** @var UserRepository $users */
        $users = static::getContainer()->get(UserRepository::class);
        $created = $users->findOneByEmail('ama.owusu@example.com');
        self::assertNotNull($created);
        self::assertTrue($created->hasRole(RoleName::EMPLOYEE));
        self::assertTrue($created->getLastPasswordChange() === null);

        /** @var EmployeeRepository $employees */
        $employees = static::getContainer()->get(EmployeeRepository::class);
        $ama = $employees->findByEmployeeNumber('EMP-101');
        $kojo = $employees->findByEmployeeNumber('EMP-102');
        self::assertNotNull($ama);
        self::assertNotNull($kojo);
        self::assertSame('Finance', $ama->getDepartment()->getName());
        self::assertSame('Ama Owusu', $ama->getName());
        self::assertSame('NON_MANAGERIAL', $ama->getClassification()->value);
        self::assertSame('MANAGERIAL', $kojo->getClassification()->value);
        self::assertNotNull($kojo->getManager());
        self::assertTrue($kojo->getManager()->getId()->equals($ama->getId()));

        /** @var DepartmentRepository $departments */
        $departments = static::getContainer()->get(DepartmentRepository::class);
        self::assertNotNull($departments->findOneByNameCaseInsensitive('Finance'));
    }

    public function testDepartmentIsReusedCaseInsensitivelyAndReportedAsNew(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        DepartmentFactory::new()->create(['name' => 'Engineering']);

        $upload = $this->buildXlsxUpload([
            ['EMP-501', 'Existing Dept', 'existing.dept@example.com', 'Engineer', 'engineering', '', 'Accra', '', 'EMPLOYEE'],
            ['EMP-502', 'New Dept', 'new.dept@example.com', 'Analyst', 'Marketing', '', 'Accra', '', 'EMPLOYEE'],
        ]);

        $client->request('POST', '/api/v1/admin/users/bulk-import/validate/', server: $this->authHeader($accessToken), files: ['file' => $upload]);
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame(['Marketing'], $body['new_departments']);

        $importId = $body['import_id'];
        $client->request('POST', "/api/v1/admin/users/bulk-import/{$importId}/confirm/", server: $this->authHeader($accessToken));
        static::getContainer()->get(ExecuteBulkImportMessageHandler::class)(new ExecuteBulkImportMessage($importId));

        /** @var DepartmentRepository $departments */
        $departments = static::getContainer()->get(DepartmentRepository::class);
        $allNamed = array_map(static fn ($d) => $d->getName(), $departments->findAllOrderedByName());
        self::assertSame(1, count(array_filter($allNamed, static fn ($n) => strtolower($n) === 'engineering')));
        self::assertContains('Marketing', $allNamed);
    }

    public function testManagerResolutionIsOrderIndependentAcrossRows(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        // The appraisor row (EMP-602) is listed AFTER the report (EMP-601)
        // in the file, but must still resolve (TASK-290).
        $upload = $this->buildXlsxUpload([
            ['EMP-601', 'Report Person', 'report.person@example.com', 'Engineer', 'IT', '', 'Accra', 'EMP-602', 'EMPLOYEE'],
            ['EMP-602', 'Boss Person', 'boss.person@example.com', 'Manager', 'IT', '', 'Accra', '', 'MANAGER'],
        ]);

        $client->request('POST', '/api/v1/admin/users/bulk-import/validate/', server: $this->authHeader($accessToken), files: ['file' => $upload]);
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertCount(2, $body['valid_rows']);

        $importId = $body['import_id'];
        $client->request('POST', "/api/v1/admin/users/bulk-import/{$importId}/confirm/", server: $this->authHeader($accessToken));
        static::getContainer()->get(ExecuteBulkImportMessageHandler::class)(new ExecuteBulkImportMessage($importId));

        /** @var EmployeeRepository $employees */
        $employees = static::getContainer()->get(EmployeeRepository::class);
        $report = $employees->findByEmployeeNumber('EMP-601');
        $boss = $employees->findByEmployeeNumber('EMP-602');
        self::assertNotNull($report);
        self::assertNotNull($boss);
        self::assertNotNull($report->getManager());
        self::assertTrue($report->getManager()->getId()->equals($boss->getId()));
    }

    public function testValidateRejectsDuplicateEmployeeNumberAgainstDatabase(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        EmployeeFactory::new()->create(['employeeNumber' => 'EMP-701']);

        $upload = $this->buildXlsxUpload([
            ['emp 701', 'Duplicate Person', 'duplicate.person@example.com', 'Engineer', 'IT', '', 'Accra', '', 'EMPLOYEE'],
        ]);

        $client->request('POST', '/api/v1/admin/users/bulk-import/validate/', server: $this->authHeader($accessToken), files: ['file' => $upload]);
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertCount(1, $body['error_rows']);
        self::assertStringContainsString('Employee number already exists.', $body['error_rows'][0]['error']);
    }

    public function testValidateRejectsAppraisorNotFoundInFileOrDatabase(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $upload = $this->buildXlsxUpload([
            ['EMP-801', 'Orphan Report', 'orphan.report@example.com', 'Engineer', 'IT', '', 'Accra', 'EMP-999', 'EMPLOYEE'],
        ]);

        $client->request('POST', '/api/v1/admin/users/bulk-import/validate/', server: $this->authHeader($accessToken), files: ['file' => $upload]);
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertCount(1, $body['error_rows']);
        self::assertStringContainsString('Appraisor employee number not found in the file or in the system.', $body['error_rows'][0]['error']);
    }

    public function testValidateAcceptsAppraisorAlreadyInDatabase(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        EmployeeFactory::new()->managerial()->create(['employeeNumber' => 'EMP-901']);

        $upload = $this->buildXlsxUpload([
            ['EMP-902', 'New Report', 'new.report@example.com', 'Engineer', 'IT', '', 'Accra', 'EMP-901', 'EMPLOYEE'],
        ]);

        $client->request('POST', '/api/v1/admin/users/bulk-import/validate/', server: $this->authHeader($accessToken), files: ['file' => $upload]);
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertCount(1, $body['valid_rows']);
        self::assertCount(0, $body['error_rows']);
    }

    public function testLegacyValidateRejectsWrongExtension(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $tempPath = tempnam(sys_get_temp_dir(), 'bad-upload-');
        file_put_contents($tempPath, 'not a spreadsheet');
        $upload = new UploadedFile($tempPath, 'employees.txt', test: true);

        $client->request('POST', '/api/v1/admin/users/bulk-import/validate/', server: $this->authHeader($accessToken), files: ['file' => $upload]);
        self::assertResponseStatusCodeSame(400);
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertArrayHasKey('detail', $body['data']);
    }

    public function testLegacyValidateWithOnlyInvalidRowsReturnsNullImportId(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $upload = $this->buildXlsxUpload([
            ['', '', 'not-an-email', '', '', '', '', '', 'EMPLOYEE'],
        ]);

        $client->request('POST', '/api/v1/admin/users/bulk-import/validate/', server: $this->authHeader($accessToken), files: ['file' => $upload]);
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertNull($body['import_id']);
        self::assertCount(1, $body['error_rows']);
    }

    public function testTemplateDownloadsAreBinaryNotEnveloped(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);

        $client->request('GET', '/api/v1/admin/users/bulk-import/template/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        self::assertStringContainsString('spreadsheetml', $client->getResponse()->headers->get('Content-Type'));

        $client->request('GET', '/api/v1/admin/users/bulk-import/template/csv/', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        self::assertStringContainsString('text/csv', $client->getResponse()->headers->get('Content-Type'));
        self::assertStringContainsString('employee_number', $client->getResponse()->getContent());
    }

    public function testAsyncJobFullLifecycleSucceeds(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $upload = $this->buildXlsxUpload([
            ['EMP-201', 'Efua Ansah', 'efua.ansah@example.com', 'Engineer', 'IT', '', 'Accra', '', 'EMPLOYEE'],
        ]);

        $client->request('POST', '/api/v1/admin/users/bulk-import/jobs/', server: $this->authHeader($accessToken), files: ['file' => $upload]);
        self::assertResponseStatusCodeSame(202);
        $job = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('PENDING_VALIDATION', $job['status']);
        $jobId = $job['id'];

        static::getContainer()->get(ValidateUserBulkImportMessageHandler::class)(new ValidateUserBulkImportMessage($jobId));

        $client->request('GET', "/api/v1/admin/users/bulk-import/jobs/{$jobId}/", server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $afterValidation = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('VALIDATED', $afterValidation['status']);
        self::assertSame(1, $afterValidation['validation_preview']['total']);

        $client->request('POST', "/api/v1/admin/users/bulk-import/jobs/{$jobId}/commit/", server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(202);
        self::assertSame('COMMITTING', json_decode($client->getResponse()->getContent(), true)['data']['status']);

        static::getContainer()->get(CommitUserBulkImportMessageHandler::class)(new CommitUserBulkImportMessage($jobId));

        $client->request('GET', "/api/v1/admin/users/bulk-import/jobs/{$jobId}/", server: $this->authHeader($accessToken));
        $final = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame('SUCCEEDED', $final['status']);
        self::assertSame(1, $final['created_count']);

        /** @var UserRepository $users */
        $users = static::getContainer()->get(UserRepository::class);
        self::assertNotNull($users->findOneByEmail('efua.ansah@example.com'));
    }

    public function testJobCreatedByFullNameComesFromCreatorsEmployeeProfile(): void
    {
        $client = static::createClient();
        $admin = EmployeeFactory::new()->create(['name' => 'HR Admin Person'])->getUser();
        $admin->addRole(RoleFactory::findOrCreate(['name' => RoleName::HR_ADMIN]));
        $admin->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => $admin->getEmail(),
            'password' => UserFactory::DEFAULT_PASSWORD,
        ]));
        $accessToken = json_decode($client->getResponse()->getContent(), true)['data']['access'];

        $upload = $this->buildXlsxUpload([
            ['EMP-951', 'Some Person', 'some.person@example.com', 'Engineer', 'IT', '', 'Accra', '', 'EMPLOYEE'],
        ]);
        $client->request('POST', '/api/v1/admin/users/bulk-import/jobs/', server: $this->authHeader($accessToken), files: ['file' => $upload]);
        $job = json_decode($client->getResponse()->getContent(), true)['data'];

        self::assertSame($admin->getEmail(), $job['created_by']['email']);
        self::assertSame('HR Admin Person', $job['created_by']['full_name']);
    }

    public function testCommitRejectedUnlessValidated(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $upload = $this->buildXlsxUpload([
            ['EMP-301', 'Test Person', 'test.person@example.com', 'Engineer', 'IT', '', 'Accra', '', 'EMPLOYEE'],
        ]);

        $client->request('POST', '/api/v1/admin/users/bulk-import/jobs/', server: $this->authHeader($accessToken), files: ['file' => $upload]);
        $jobId = json_decode($client->getResponse()->getContent(), true)['data']['id'];

        // Still PENDING_VALIDATION — commit must be rejected.
        $client->request('POST', "/api/v1/admin/users/bulk-import/jobs/{$jobId}/commit/", server: $this->authHeader($accessToken));
        self::assertResponseStatusCodeSame(409);
    }

    public function testFailedRowsCsvDownload(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        $upload = $this->buildXlsxUpload([
            ['', '', 'not-an-email', '', '', '', '', '', 'EMPLOYEE'],
            ['EMP-401', 'Valid Person', 'valid.person@example.com', 'Engineer', 'IT', '', 'Accra', '', 'EMPLOYEE'],
        ]);

        $client->request('POST', '/api/v1/admin/users/bulk-import/jobs/', server: $this->authHeader($accessToken), files: ['file' => $upload]);
        $jobId = json_decode($client->getResponse()->getContent(), true)['data']['id'];

        static::getContainer()->get(ValidateUserBulkImportMessageHandler::class)(new ValidateUserBulkImportMessage($jobId));
        $client->request('POST', "/api/v1/admin/users/bulk-import/jobs/{$jobId}/commit/", server: $this->authHeader($accessToken));
        static::getContainer()->get(CommitUserBulkImportMessageHandler::class)(new CommitUserBulkImportMessage($jobId));

        $client->request('GET', "/api/v1/admin/users/bulk-import/jobs/{$jobId}/failed-rows.csv/", server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        self::assertStringContainsString('text/csv', $client->getResponse()->headers->get('Content-Type'));
        self::assertStringContainsString('row_number,employee_number,email,error', $client->getResponse()->getContent());
    }

    public function testJobListIsPaginated(): void
    {
        [$client, $accessToken] = $this->loginAs(RoleName::HR_ADMIN);
        foreach (range(1, 3) as $i) {
            $upload = $this->buildXlsxUpload([
                ["EMP-{$i}00", "Person {$i}", "person{$i}@example.com", 'Engineer', 'IT', '', 'Accra', '', 'EMPLOYEE'],
            ]);
            $client->request('POST', '/api/v1/admin/users/bulk-import/jobs/', server: $this->authHeader($accessToken), files: ['file' => $upload]);
        }

        $client->request('GET', '/api/v1/admin/users/bulk-import/jobs/?page_size=2', server: $this->authHeader($accessToken));
        self::assertResponseIsSuccessful();
        $body = json_decode($client->getResponse()->getContent(), true);
        self::assertCount(2, $body['data']);
        self::assertGreaterThanOrEqual(3, $body['meta']['pagination']['count']);
    }

    /**
     * @param list<list<string>> $rows
     */
    private function buildXlsxUpload(array $rows): UploadedFile
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Employees');
        $sheet->fromArray(self::HEADERS, null, 'A1');
        foreach ($rows as $i => $row) {
            $sheet->fromArray($row, null, 'A'.($i + 2));
        }

        $tempPath = tempnam(sys_get_temp_dir(), 'test-xlsx-').'.xlsx';
        (new XlsxWriter($spreadsheet))->save($tempPath);

        return new UploadedFile($tempPath, 'employees.xlsx', test: true);
    }

    /**
     * @return array{0: KernelBrowser, 1: string}
     */
    private function loginAs(RoleName $role): array
    {
        $client = static::createClient();
        $user = UserFactory::new()->withRoles($role)->create();
        $user->setLastPasswordChange(new \DateTimeImmutable('-30 days'));
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        $client->request('POST', '/api/v1/auth/login/', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'identifier' => $user->getEmail(),
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
