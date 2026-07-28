<?php

declare(strict_types=1);

namespace App\Tests\Functional\Reports;

use App\Entity\CompetencyRating;
use App\Entity\GrowthPlan;
use App\Entity\KeyDeliverable;
use App\Entity\Signature;
use App\Entity\StrengthWeakness;
use App\Entity\User;
use App\Enum\AppraisalPartyRole;
use App\Enum\AppraisalStatus;
use App\Enum\RoleName;
use App\Enum\SignatureAction;
use App\Enum\StrengthWeaknessType;
use App\Factory\AppraisalCycleFactory;
use App\Factory\AppraisalFactory;
use App\Factory\BscPerspectiveFactory;
use App\Factory\CompetencyFactory;
use App\Factory\EmployeeFactory;
use App\Factory\RoleFactory;
use App\Factory\UserFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.reports.tests' coverage for Milestone 13e: the
 * appraisal PDF export and the audit compliance PDF export. Covers
 * RBAC (AppraisalPDFView's appraisee/manager/admin/executive access,
 * AuditCompliancePDFView's IsHRStaff-only no-EXECUTIVE carve-out), the
 * SIGNED_OFF/FINALISED status guard, and that generated output is a
 * real PDF (dompdf, not WeasyPrint — see the reports port plan).
 */
final class PdfExportReportsTest extends WebTestCase
{
    public function testAppraisalPdfNonexistentAppraisalReturns404(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);

        $client->request('GET', '/api/v1/appraisals/'.Uuid::v7().'/pdf/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(404);
    }

    public function testAppraisalPdfDeniesUnrelatedEmployee(): void
    {
        $client = static::createClient();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $appraisal = AppraisalFactory::new()->create(['status' => AppraisalStatus::FINALISED, 'totalScore' => '4.00', 'performanceDescriptor' => 'Meets']);
        $stranger = EmployeeFactory::new()->create();
        $stranger->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));
        $em->flush();

        [$client, $token] = $this->login($stranger->getUser(), $client);
        $client->request('GET', '/api/v1/appraisals/'.$appraisal->getId().'/pdf/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(403);
    }

    public function testAppraisalPdfDeniesNonFinalStatus(): void
    {
        $client = static::createClient();
        $appraisal = AppraisalFactory::new()->create(['status' => AppraisalStatus::DISCUSSION]);
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/appraisals/'.$appraisal->getId().'/pdf/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(403);
    }

    public function testAppraisalPdfAllowsSelfAndGeneratesRealPdf(): void
    {
        $client = static::createClient();
        $em = static::getContainer()->get(EntityManagerInterface::class);

        $employee = EmployeeFactory::new()->create();
        $employee->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::EMPLOYEE]));
        $appraisal = AppraisalFactory::new()->create([
            'employee' => $employee,
            'status' => AppraisalStatus::FINALISED,
            'totalScore' => '4.20',
            'kdAverageScore' => '4.50',
            'bcAverageScore' => '3.80',
            'performanceDescriptor' => 'Exceeds',
        ]);

        $perspective = BscPerspectiveFactory::new()->create();
        $kd = new KeyDeliverable($appraisal, $perspective, 'Ship the quarterly report', '0.5000');
        $kd->setSelfRating('4.00');
        $kd->setManagerRating('4.50');
        $kd->setWeightedScore('2.2500');
        $em->persist($kd);

        $competency = CompetencyFactory::new()->create();
        $rating = new CompetencyRating($appraisal, $competency);
        $rating->setSelfRating('4.00');
        $rating->setManagerRating('3.80');
        $em->persist($rating);

        $growthPlan = new GrowthPlan($appraisal, 'Solid year overall.');
        $em->persist($growthPlan);
        $em->persist(new StrengthWeakness($growthPlan, StrengthWeaknessType::STRENGTH, 'Strong communicator'));

        $signer = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        $em->persist(new Signature($appraisal, $signer, AppraisalPartyRole::APPRAISEE, SignatureAction::ACCEPT, new \DateTimeImmutable('-1 day'), '127.0.0.1', 'hash', 1));

        $em->flush();

        [$client, $token] = $this->login($employee->getUser(), $client);
        $client->request('GET', '/api/v1/appraisals/'.$appraisal->getId().'/pdf/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        self::assertStringContainsString('application/pdf', (string) $client->getResponse()->headers->get('Content-Type'));
        $content = $client->getInternalResponse()->getContent();
        self::assertStringStartsWith('%PDF', $content);
    }

    public function testAppraisalPdfAllowsManagerOfAppraisee(): void
    {
        $client = static::createClient();
        $em = static::getContainer()->get(EntityManagerInterface::class);

        $manager = EmployeeFactory::new()->managerial()->create();
        $manager->getUser()->addRole(RoleFactory::findOrCreate(['name' => RoleName::MANAGER]));
        $employee = EmployeeFactory::new()->withManager($manager)->create();
        $appraisal = AppraisalFactory::new()->create(['employee' => $employee, 'status' => AppraisalStatus::SIGNED_OFF, 'totalScore' => '3.00', 'performanceDescriptor' => 'Meets']);

        $em->flush();

        [$client, $token] = $this->login($manager->getUser(), $client);
        $client->request('GET', '/api/v1/appraisals/'.$appraisal->getId().'/pdf/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
    }

    public function testAuditCompliancePdfRequiresHrStaffButNotExecutive(): void
    {
        $client = static::createClient();
        [$client, $execToken] = $this->loginAsRole($client, RoleName::EXECUTIVE);
        $client->request('GET', '/api/v1/reports/audit-compliance/pdf/', server: $this->authHeader($execToken));
        self::assertResponseStatusCodeSame(403);
    }

    public function testAuditCompliancePdfReturns400WhenNoActiveCycle(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);

        $client->request('GET', '/api/v1/reports/audit-compliance/pdf/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(400);
    }

    public function testAuditCompliancePdfGeneratesRealPdfForCycle(): void
    {
        $client = static::createClient();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $cycle = AppraisalCycleFactory::new()->active()->create();

        $appraisal = AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::DISPUTED]);
        $signer = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        $em->persist(new Signature($appraisal, $signer, AppraisalPartyRole::APPRAISEE, SignatureAction::REJECT, new \DateTimeImmutable('-1 day'), '127.0.0.1', 'hash', 1));

        $em->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/audit-compliance/pdf/?cycle_id='.$cycle->getId(), server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        self::assertStringContainsString('application/pdf', (string) $client->getResponse()->headers->get('Content-Type'));
        $content = $client->getInternalResponse()->getContent();
        self::assertStringStartsWith('%PDF', $content);
    }

    /**
     * @return array{0: KernelBrowser, 1: string}
     */
    private function loginAsRole(KernelBrowser $client, RoleName $role): array
    {
        $user = UserFactory::new()->withRoles($role)->create();
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
        return ['CONTENT_TYPE' => 'application/json', 'HTTP_AUTHORIZATION' => 'Bearer '.$accessToken];
    }
}
