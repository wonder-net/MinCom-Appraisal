<?php

declare(strict_types=1);

namespace App\Tests\Functional\Audit;

use App\Entity\AuditLog;
use App\Enum\RoleName;
use App\Factory\UserFactory;
use App\Service\AuditChainVerifier;
use App\Service\AuditService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Component\Uid\Uuid;

/**
 * Port of apps.audit.tests.test_audit's coverage of the AuditLog
 * model + AuditService: hash-chain linkage, HMAC computation,
 * append-only enforcement, verify_chain(), and state hashing.
 */
final class AuditServiceTest extends KernelTestCase
{
    public function testFirstEntryUsesGenesisHash(): void
    {
        $service = $this->auditService();

        $entry = $service->log('test.action', 'TestResource', Uuid::v7());

        self::assertSame(AuditLog::GENESIS_HASH, $entry->getPreviousHash());
        self::assertSame(hash('sha256', ''), AuditLog::GENESIS_HASH);
    }

    public function testSecondEntryChainsToFirst(): void
    {
        $service = $this->auditService();

        $first = $service->log('first.action', 'TestResource', Uuid::v7());
        $second = $service->log('second.action', 'TestResource', Uuid::v7());

        self::assertSame($first->computeChainHash(), $second->getPreviousHash());
    }

    public function testEntryHmacIsVerifiable(): void
    {
        $service = $this->auditService();
        $entry = $service->log('hmac.test', 'TestResource', Uuid::v7());

        $hmacKey = self::getContainer()->getParameter('app.audit_hmac_key');
        self::assertSame($entry->getEntryHmac(), $entry->computeExpectedHmac($hmacKey));
        self::assertSame(64, strlen($entry->getEntryHmac()));
    }

    public function testLogWithUserStoresRawUserId(): void
    {
        $service = $this->auditService();
        $user = UserFactory::new()->withRoles(RoleName::EMPLOYEE)->create();
        self::getContainer()->get(EntityManagerInterface::class)->flush();

        $entry = $service->log('user.login', 'User', $user->getId(), $user);

        self::assertTrue($entry->getUserId()->equals($user->getId()));
    }

    public function testLogWithoutUserIsNull(): void
    {
        $service = $this->auditService();
        $entry = $service->log('system.cleanup', 'System', Uuid::v7());

        self::assertNull($entry->getUserId());
    }

    public function testOldAndNewStateAreHashed(): void
    {
        $service = $this->auditService();
        $oldState = ['status' => 'DRAFT'];
        $newState = ['status' => 'SELF_ASSESSMENT'];

        $entry = $service->log('appraisal.submit', 'Appraisal', Uuid::v7(), null, $oldState, $newState);

        $expectedOld = hash('sha256', json_encode($oldState, \JSON_THROW_ON_ERROR));
        $expectedNew = hash('sha256', json_encode($newState, \JSON_THROW_ON_ERROR));
        self::assertSame($expectedOld, $entry->getOldValueHash());
        self::assertSame($expectedNew, $entry->getNewValueHash());
    }

    public function testStateHashIsEmptyStringWhenStateIsNull(): void
    {
        $service = $this->auditService();
        $entry = $service->log('test.action', 'TestResource', Uuid::v7());

        self::assertSame('', $entry->getOldValueHash());
        self::assertSame('', $entry->getNewValueHash());
    }

    public function testStateHashIsStableRegardlessOfKeyOrder(): void
    {
        $service = $this->auditService();

        $entryA = $service->log('a', 'T', Uuid::v7(), null, null, ['z_field' => 1, 'a_field' => 2]);
        $entryB = $service->log('b', 'T', Uuid::v7(), null, null, ['a_field' => 2, 'z_field' => 1]);

        self::assertSame($entryA->getNewValueHash(), $entryB->getNewValueHash());
    }

    public function testGuardAgainstUpdateThrows(): void
    {
        $service = $this->auditService();
        $entry = $service->log('test.action', 'TestResource', Uuid::v7());

        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('cannot be modified');
        $entry->guardAgainstUpdate();
    }

    public function testGuardAgainstRemovalThrows(): void
    {
        $service = $this->auditService();
        $entry = $service->log('test.action', 'TestResource', Uuid::v7());

        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('cannot be deleted');
        $entry->guardAgainstRemoval();
    }

    public function testDirectDoctrineUpdateIsRejectedByTrigger(): void
    {
        $service = $this->auditService();
        $entry = $service->log('trigger.test', 'TestResource', Uuid::v7());

        $connection = self::getContainer()->get(EntityManagerInterface::class)->getConnection();

        $this->expectException(\Throwable::class);
        $connection->executeStatement('UPDATE audit_log SET action = ? WHERE id = ?', ['tampered', (string) $entry->getId()]);
    }

    public function testVerifyChainReturnsTrueForIntactChain(): void
    {
        $service = $this->auditService();
        $service->log('entry.one', 'T', Uuid::v7());
        $service->log('entry.two', 'T', Uuid::v7());
        $service->log('entry.three', 'T', Uuid::v7());

        [$isValid, $errors] = $this->auditVerifier()->verify();

        self::assertTrue($isValid);
        self::assertSame([], $errors);
    }

    public function testVerifyChainReturnsTrueForEmptyChain(): void
    {
        [$isValid, $errors] = $this->auditVerifier()->verify();

        self::assertTrue($isValid);
        self::assertSame([], $errors);
    }

    public function testVerifyChainDetectsTamperedHmac(): void
    {
        // The append-only trigger (see the creating migration) rejects
        // UPDATE unconditionally, and our test DB role isn't privileged
        // enough to bypass it either — both are working as intended. So instead
        // of tampering an existing row, a corrupt row is inserted
        // directly (INSERT isn't blocked by the trigger, only
        // UPDATE/DELETE are), simulating an entry that was corrupt
        // from the moment it landed in the table.
        $this->insertRawEntry(previousHash: AuditLog::GENESIS_HASH, entryHmac: str_repeat('f', 64));

        [$isValid, $errors] = $this->auditVerifier()->verify();

        self::assertFalse($isValid);
        self::assertNotEmpty($errors);
        self::assertStringContainsString('HMAC mismatch', $errors[0]);
    }

    public function testVerifyChainDetectsTamperedPreviousHash(): void
    {
        $service = $this->auditService();
        $service->log('entry.one', 'T', Uuid::v7());

        $this->insertRawEntry(previousHash: str_repeat('0', 64), entryHmac: str_repeat('f', 64));

        [$isValid, $errors] = $this->auditVerifier()->verify();

        self::assertFalse($isValid);
        self::assertStringContainsString('previous_hash mismatch', implode(' ', $errors));
    }

    private function insertRawEntry(string $previousHash, string $entryHmac): void
    {
        $connection = self::getContainer()->get(EntityManagerInterface::class)->getConnection();
        $connection->executeStatement(
            'INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, old_value_hash, new_value_hash, metadata, ip_address, timestamp, previous_hash, entry_hmac)
             VALUES (:id, NULL, :action, :resourceType, :resourceId, :oldHash, :newHash, :metadata, NULL, :timestamp, :previousHash, :entryHmac)',
            [
                'id' => (string) Uuid::v7(),
                'action' => 'raw.tampered.entry',
                'resourceType' => 'TestResource',
                'resourceId' => (string) Uuid::v7(),
                'oldHash' => '',
                'newHash' => '',
                'metadata' => '{}',
                'timestamp' => (new \DateTimeImmutable('+1 second'))->format('Y-m-d H:i:s'),
                'previousHash' => $previousHash,
                'entryHmac' => $entryHmac,
            ],
        );
    }

    public function testVerifyChainInvalidStartIdReturnsError(): void
    {
        $fakeId = Uuid::v7();
        [$isValid, $errors] = $this->auditVerifier()->verify($fakeId);

        self::assertFalse($isValid);
        self::assertStringContainsString((string) $fakeId, $errors[0]);
    }

    /**
     * Port of the request-metadata slice of Django's
     * AuditContextMiddleware — see AuditRequestContext's docblock. No
     * HTTP request is in flight in a plain KernelTestCase, mirroring
     * Django's audit_context ContextVar defaulting to None outside a
     * request (e.g. a management command) — so metadata stays empty
     * unless the caller supplies it.
     */
    public function testMetadataIsEmptyWithNoRequestInFlight(): void
    {
        $service = $this->auditService();
        $entry = $service->log('test.action', 'TestResource', Uuid::v7());

        self::assertSame([], $entry->getMetadata());
    }

    public function testMetadataIsSeededFromTheCurrentRequestWhenOneExists(): void
    {
        $service = $this->auditService();
        $request = Request::create('/api/v1/appraisals/cycles/', 'POST');
        $request->attributes->set('correlation_id', 'req-context-test');
        self::getContainer()->get(RequestStack::class)->push($request);

        $entry = $service->log('test.action', 'TestResource', Uuid::v7());

        self::assertSame([
            'correlation_id' => 'req-context-test',
            'request_path' => '/api/v1/appraisals/cycles/',
            'request_method' => 'POST',
        ], $entry->getMetadata());
    }

    public function testCallerSuppliedMetadataOverridesAmbientContext(): void
    {
        $service = $this->auditService();
        $request = Request::create('/api/v1/appraisals/cycles/', 'POST');
        $request->attributes->set('correlation_id', 'req-context-test');
        self::getContainer()->get(RequestStack::class)->push($request);

        $entry = $service->log('test.action', 'TestResource', Uuid::v7(), null, null, null, null, [
            'correlation_id' => 'explicit-override',
            'extra' => 'kept',
        ]);

        self::assertSame([
            'correlation_id' => 'explicit-override',
            'request_path' => '/api/v1/appraisals/cycles/',
            'request_method' => 'POST',
            'extra' => 'kept',
        ], $entry->getMetadata());
    }

    private function auditService(): AuditService
    {
        self::bootKernel();

        return self::getContainer()->get(AuditService::class);
    }

    private function auditVerifier(): AuditChainVerifier
    {
        return self::getContainer()->get(AuditChainVerifier::class);
    }
}
