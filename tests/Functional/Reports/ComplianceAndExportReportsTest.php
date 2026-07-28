<?php

declare(strict_types=1);

namespace App\Tests\Functional\Reports;

use App\Entity\CareerPlan;
use App\Entity\GrowthPlan;
use App\Entity\Signature;
use App\Entity\TrainingNeed;
use App\Entity\User;
use App\Enum\AppraisalFormType;
use App\Enum\AppraisalPartyRole;
use App\Enum\AppraisalStatus;
use App\Enum\RoleName;
use App\Enum\SignatureAction;
use App\Enum\TrainingNeedPriority;
use App\Enum\TrainingNeedType;
use App\Factory\AppraisalCycleFactory;
use App\Factory\AppraisalFactory;
use App\Factory\EmployeeFactory;
use App\Factory\UserFactory;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.reports.tests' coverage for Milestone 13d: Training
 * Needs, Career Aspiration Pipeline, Dispute Log, Score Descriptor
 * Config Audit, and Bulk CSV Export reports. Covers RBAC (including
 * BulkCSVExportView/TrainingNeedsReportView/DisputeLogReportView/
 * ScoreDescriptorConfigAuditView's IsHRStaff-only, no-EXECUTIVE
 * carve-out), aggregation correctness (priority zero-fill with FOURTH
 * excluded, title-case role normalisation, signed_at-descending-nulls-
 * last dispute ordering), and param validation.
 */
final class ComplianceAndExportReportsTest extends WebTestCase
{
    public function testTrainingNeedsRequiresHrStaffButNotExecutive(): void
    {
        $client = static::createClient();
        [$client, $execToken] = $this->loginAsRole($client, RoleName::EXECUTIVE);
        $client->request('GET', '/api/v1/reports/training-needs/', server: $this->authHeader($execToken));
        self::assertResponseStatusCodeSame(403);

        [$client, $hrToken] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/training-needs/', server: $this->authHeader($hrToken));
        self::assertResponseStatusCodeSame(200);
    }

    public function testTrainingNeedsGroupsByPriorityAndExcludesFourth(): void
    {
        $client = static::createClient();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $cycle = AppraisalCycleFactory::new()->active()->create();
        $appraisal = AppraisalFactory::new()->create(['cycle' => $cycle]);
        $growthPlan = new GrowthPlan($appraisal);
        $em->persist($growthPlan);

        $em->persist(new TrainingNeed($growthPlan, TrainingNeedType::ON_THE_JOB, 'Shadow a senior engineer', TrainingNeedPriority::FIRST));
        $em->persist(new TrainingNeed($growthPlan, TrainingNeedType::ON_THE_JOB, 'Lead a project', TrainingNeedPriority::FIRST));
        $need4 = new TrainingNeed($growthPlan, TrainingNeedType::ON_THE_JOB, 'Should not appear', TrainingNeedPriority::FOURTH);
        $em->persist($need4);

        $course = new TrainingNeed($growthPlan, TrainingNeedType::RECOMMENDED_COURSE, 'Course need', TrainingNeedPriority::SECOND);
        $course->setCourseTitle('Advanced PHP');
        $course->setInstitution('Tech Academy');
        $em->persist($course);

        $em->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/training-needs/?cycle_id='.$cycle->getId(), server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertCount(3, $body['training_needs']);
        $byPriority = array_column($body['training_needs'], null, 'priority');
        self::assertSame(2, $byPriority['FIRST']['count']);
        self::assertSame(1, $byPriority['SECOND']['count']);
        self::assertSame(0, $byPriority['THIRD']['count']);
        self::assertCount(1, $body['recommended_courses']);
        self::assertSame('Advanced PHP', $body['recommended_courses'][0]['title']);
        self::assertSame('Tech Academy', $body['recommended_courses'][0]['institution']);
    }

    public function testCareerAspirationPipelineNormalisesAndCounts(): void
    {
        $client = static::createClient();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $cycle = AppraisalCycleFactory::new()->active()->create();

        $a1 = AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::FINALISED]);
        $gp1 = new GrowthPlan($a1);
        $em->persist($gp1);
        $em->persist(new CareerPlan($gp1, '  engineering director  ', 'FIRST'));

        $a2 = AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::FINALISED]);
        $gp2 = new GrowthPlan($a2);
        $em->persist($gp2);
        $em->persist(new CareerPlan($gp2, 'Engineering Director', 'SECOND'));

        // Non-FINALISED appraisal's career plan must not count.
        $a3 = AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::DISCUSSION]);
        $gp3 = new GrowthPlan($a3);
        $em->persist($gp3);
        $em->persist(new CareerPlan($gp3, 'Product Manager', 'FIRST'));

        $em->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/career-pipeline/?cycle_id='.$cycle->getId(), server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertCount(1, $body['aspired_roles']);
        self::assertSame('Engineering Director', $body['aspired_roles'][0]['aspired_role']);
        self::assertSame(2, $body['aspired_roles'][0]['count']);
        self::assertSame('FIRST', $body['aspired_roles'][0]['top_priority']);
    }

    public function testDisputeLogOrdersBySignedAtDescendingNullsLast(): void
    {
        $client = static::createClient();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $cycle = AppraisalCycleFactory::new()->active()->create();

        $signed = AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::DISPUTED]);
        $signer = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        $em->persist(new Signature($signed, $signer, AppraisalPartyRole::APPRAISEE, SignatureAction::REJECT, new \DateTimeImmutable('-2 days'), '127.0.0.1', 'hash', 1));

        // A DISPUTED appraisal with no signature at all — appears with null signed_at, sorted last.
        AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::DISPUTED]);

        $em->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/disputes/?cycle_id='.$cycle->getId(), server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame(2, $body['count']);
        self::assertNotNull($body['disputes'][0]['signed_at']);
        self::assertSame('REJECT', $body['disputes'][0]['signature_action']);
        self::assertNull($body['disputes'][1]['signed_at']);
    }

    public function testScoreDescriptorConfigAuditRequiresCycleId(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);

        $client->request('GET', '/api/v1/reports/descriptor-config/', server: $this->authHeader($token));
        self::assertResponseStatusCodeSame(400);

        $client->request('GET', '/api/v1/reports/descriptor-config/?cycle_id=not-a-uuid', server: $this->authHeader($token));
        self::assertResponseStatusCodeSame(400);

        $client->request('GET', '/api/v1/reports/descriptor-config/?cycle_id='.Uuid::v7(), server: $this->authHeader($token));
        self::assertResponseStatusCodeSame(404);
    }

    public function testScoreDescriptorConfigAuditReturnsSnapshotAndLiveBands(): void
    {
        $client = static::createClient();
        $cycle = AppraisalCycleFactory::new()->active()->create();
        static::getContainer()->get(EntityManagerInterface::class)->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/descriptor-config/?cycle_id='.$cycle->getId(), server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        $body = json_decode($client->getResponse()->getContent(), true)['data'];
        self::assertSame((string) $cycle->getId(), $body['cycle_id']);
        self::assertArrayHasKey('config_snapshot_bands', $body);
        self::assertArrayHasKey('live_bands', $body);
    }

    public function testCsvExportRequiresHrStaffButNotExecutive(): void
    {
        $client = static::createClient();
        [$client, $execToken] = $this->loginAsRole($client, RoleName::EXECUTIVE);
        $client->request('GET', '/api/v1/reports/export/csv/', server: $this->authHeader($execToken));
        self::assertResponseStatusCodeSame(403);
    }

    public function testCsvExportReturns404WhenNoActiveCycle(): void
    {
        $client = static::createClient();
        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);

        $client->request('GET', '/api/v1/reports/export/csv/', server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(404);
    }

    public function testCsvExportStreamsFinalisedAppraisalsOnly(): void
    {
        $client = static::createClient();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $cycle = AppraisalCycleFactory::new()->active()->create();

        $employee = EmployeeFactory::new()->create(['name' => 'Jane Exportable']);
        AppraisalFactory::new()->create([
            'cycle' => $cycle,
            'employee' => $employee,
            'status' => AppraisalStatus::FINALISED,
            'formType' => AppraisalFormType::FORM_A,
            'totalScore' => '4.25',
        ]);
        AppraisalFactory::new()->create(['cycle' => $cycle, 'status' => AppraisalStatus::DISCUSSION]);

        $em->flush();

        [$client, $token] = $this->loginAsRole($client, RoleName::HR_ADMIN);
        $client->request('GET', '/api/v1/reports/export/csv/?cycle_id='.$cycle->getId(), server: $this->authHeader($token));

        self::assertResponseStatusCodeSame(200);
        self::assertStringContainsString('text/csv', (string) $client->getResponse()->headers->get('Content-Type'));
        // StreamedResponse::getContent() always returns false by design
        // (and the streaming callback only fires once); BrowserKit
        // already captured the streamed output into getInternalResponse().
        $content = $client->getInternalResponse()->getContent();
        self::assertStringContainsString('Jane Exportable', $content);
        self::assertSame(2, substr_count($content, "\n")); // header + 1 data row only
        self::assertStringContainsString('Managerial', $content);
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
