<?php

declare(strict_types=1);

namespace App\Tests\Unit\Service;

use App\Service\SentryEventScrubber;
use PHPUnit\Framework\TestCase;
use Sentry\Event;
use Sentry\UserDataBag;

/**
 * Port of backend/utils/tests/test_sentry.py's coverage of
 * scrub_sensitive_data. Rule 3 (strip the Authorization header) has no
 * equivalent test here — see SentryEventScrubber's docblock for why
 * (the Sentry PHP SDK already strips it by default).
 */
final class SentryEventScrubberTest extends TestCase
{
    private SentryEventScrubber $scrubber;

    protected function setUp(): void
    {
        $this->scrubber = new SentryEventScrubber();
    }

    // -------------------------------------------------------------------
    // Rule 1 — strip PII keys from extra and contexts
    // -------------------------------------------------------------------

    public function testExtraEmployeeNameRemoved(): void
    {
        $event = Event::createEvent();
        $event->setExtra(['employee_name' => 'John Smith', 'department' => 'Engineering']);

        $result = ($this->scrubber)($event);

        self::assertSame('[Filtered]', $result->getExtra()['employee_name']);
        self::assertSame('Engineering', $result->getExtra()['department']);
    }

    /**
     * @dataProvider scoreKeyProvider
     */
    public function testExtraScoreKeysRemoved(string $key): void
    {
        $event = Event::createEvent();
        $event->setExtra([$key => '4.5', 'department' => 'HR']);

        $result = ($this->scrubber)($event);

        self::assertSame('[Filtered]', $result->getExtra()[$key]);
        self::assertSame('HR', $result->getExtra()['department']);
    }

    /**
     * @return iterable<string, array{0: string}>
     */
    public static function scoreKeyProvider(): iterable
    {
        yield 'score' => ['score'];
        yield 'scores' => ['scores'];
        yield 'total_score' => ['total_score'];
        yield 'kd_average_score' => ['kd_average_score'];
        yield 'bc_average_score' => ['bc_average_score'];
    }

    /**
     * @dataProvider commentKeyProvider
     */
    public function testExtraCommentKeysRemoved(string $key): void
    {
        $event = Event::createEvent();
        $event->setExtra([$key => 'Needs improvement', 'appraisal_id' => 'a-1']);

        $result = ($this->scrubber)($event);

        self::assertSame('[Filtered]', $result->getExtra()[$key]);
        self::assertSame('a-1', $result->getExtra()['appraisal_id']);
    }

    /**
     * @return iterable<string, array{0: string}>
     */
    public static function commentKeyProvider(): iterable
    {
        yield 'comment' => ['comment'];
        yield 'comment_content' => ['comment_content'];
        yield 'content' => ['content'];
        yield 'body' => ['body'];
        yield 'reason' => ['reason'];
    }

    public function testExtraEmailAndUsernameRemoved(): void
    {
        $event = Event::createEvent();
        $event->setExtra(['email' => 'alice@mincom.com', 'username' => 'alice.smith', 'role' => 'manager']);

        $result = ($this->scrubber)($event);

        self::assertSame('[Filtered]', $result->getExtra()['email']);
        self::assertSame('[Filtered]', $result->getExtra()['username']);
        self::assertSame('manager', $result->getExtra()['role']);
    }

    // -------------------------------------------------------------------
    // Rule 1b — context scoping (no false positives on SDK contexts)
    // -------------------------------------------------------------------

    public function testRuntimeContextNotScrubbed(): void
    {
        $event = Event::createEvent();
        $event->setContext('runtime', ['name' => 'PHP', 'version' => '8.2']);

        $result = ($this->scrubber)($event);

        self::assertSame('PHP', $result->getContexts()['runtime']['name']);
    }

    public function testOsContextNotScrubbed(): void
    {
        $event = Event::createEvent();
        $event->setContext('os', ['name' => 'Linux']);

        $result = ($this->scrubber)($event);

        self::assertSame('Linux', $result->getContexts()['os']['name']);
    }

    public function testBrowserContextIsScrubbed(): void
    {
        $event = Event::createEvent();
        $event->setContext('browser', ['name' => 'Chrome']);

        $result = ($this->scrubber)($event);

        self::assertSame('[Filtered]', $result->getContexts()['browser']['name']);
    }

    public function testCustomContextIsScrubbedAsSafetyDefault(): void
    {
        $event = Event::createEvent();
        $event->setContext('appraisal_debug', ['employee_name' => 'Alice', 'score' => '4.5']);

        $result = ($this->scrubber)($event);

        self::assertSame('[Filtered]', $result->getContexts()['appraisal_debug']['employee_name']);
        self::assertSame('[Filtered]', $result->getContexts()['appraisal_debug']['score']);
    }

    public function testMixedContextsSelectiveScrubbing(): void
    {
        $event = Event::createEvent();
        $event->setContext('runtime', ['name' => 'PHP']);
        $event->setContext('os', ['name' => 'Linux']);
        $event->setContext('custom', ['employee_name' => 'Bob', 'total_score' => '85']);
        $event->setContext('browser', ['name' => 'Firefox']);

        $result = ($this->scrubber)($event);
        $contexts = $result->getContexts();

        self::assertSame('PHP', $contexts['runtime']['name']);
        self::assertSame('Linux', $contexts['os']['name']);
        self::assertSame('[Filtered]', $contexts['custom']['employee_name']);
        self::assertSame('[Filtered]', $contexts['custom']['total_score']);
        self::assertSame('[Filtered]', $contexts['browser']['name']);
    }

    // -------------------------------------------------------------------
    // Rule 2 — anonymise user context (keep only id)
    // -------------------------------------------------------------------

    public function testIpAddressAndEmailStripped(): void
    {
        $event = Event::createEvent();
        $event->setUser(new UserDataBag('123', 'alice@mincom.com', '203.0.113.1', 'alice.smith'));

        $result = ($this->scrubber)($event);

        self::assertSame('123', $result->getUser()->getId());
        self::assertNull($result->getUser()->getEmail());
        self::assertNull($result->getUser()->getIpAddress());
        self::assertNull($result->getUser()->getUsername());
    }

    public function testUserWithoutIdReturnsEmptyBag(): void
    {
        $event = Event::createEvent();
        $event->setUser(new UserDataBag(null, 'nobody@example.com', '10.0.0.1'));

        $result = ($this->scrubber)($event);

        self::assertNull($result->getUser()->getId());
        self::assertNull($result->getUser()->getEmail());
    }

    public function testNoUserKeyNoError(): void
    {
        $event = Event::createEvent();

        $result = ($this->scrubber)($event);

        self::assertNull($result->getUser());
    }

    // -------------------------------------------------------------------
    // Rule 4 (Django's rule 4; rule 3 — auth headers — is SDK-default,
    // see class docblock) — strip search query parameters
    // -------------------------------------------------------------------

    /**
     * @dataProvider searchParamProvider
     */
    public function testSearchQueryParameterStripped(string $param): void
    {
        $event = Event::createEvent();
        $event->setRequest(['url' => 'https://api.example.com/v1/employees/', 'query_string' => $param.'=john+smith&page=2']);

        $result = ($this->scrubber)($event);

        $qs = $result->getRequest()['query_string'];
        self::assertStringNotContainsString($param.'=', $qs);
        self::assertStringNotContainsString('john', $qs);
        self::assertStringContainsString('page=2', $qs);
    }

    /**
     * @return iterable<string, array{0: string}>
     */
    public static function searchParamProvider(): iterable
    {
        yield 'q' => ['q'];
        yield 'search' => ['search'];
        yield 'query' => ['query'];
    }

    public function testEmptyQueryStringUnchanged(): void
    {
        $event = Event::createEvent();
        $event->setRequest(['url' => 'https://api.example.com/', 'query_string' => '']);

        $result = ($this->scrubber)($event);

        self::assertSame('', $result->getRequest()['query_string']);
    }

    public function testNoQueryStringKeyNoError(): void
    {
        $event = Event::createEvent();
        $event->setRequest(['url' => 'https://api.example.com/']);

        $result = ($this->scrubber)($event);

        self::assertArrayNotHasKey('query_string', $result->getRequest());
    }

    // -------------------------------------------------------------------
    // Combined
    // -------------------------------------------------------------------

    public function testAllRulesAppliedTogether(): void
    {
        $event = Event::createEvent();
        $event->setUser(new UserDataBag('u-1', 'bob@mincom.com', '10.0.0.1'));
        $event->setExtra([
            'employee_name' => 'Bob',
            'appraisal_id' => 'a-1',
            'total_score' => '85.0',
            'comment' => 'Good work',
        ]);
        $event->setContext('custom', ['full_name' => 'Robert Smith', 'score' => '4.2']);
        $event->setContext('runtime', ['name' => 'PHP']);
        $event->setRequest(['url' => 'https://api.example.com/v1/appraisals/', 'query_string' => 'q=smith&page=1']);

        $result = ($this->scrubber)($event);

        self::assertSame('[Filtered]', $result->getExtra()['employee_name']);
        self::assertSame('[Filtered]', $result->getExtra()['total_score']);
        self::assertSame('[Filtered]', $result->getExtra()['comment']);
        self::assertSame('a-1', $result->getExtra()['appraisal_id']);
        self::assertSame('[Filtered]', $result->getContexts()['custom']['full_name']);
        self::assertSame('[Filtered]', $result->getContexts()['custom']['score']);
        self::assertSame('PHP', $result->getContexts()['runtime']['name']);
        self::assertSame('u-1', $result->getUser()->getId());
        self::assertNull($result->getUser()->getEmail());
        self::assertStringNotContainsString('q=', $result->getRequest()['query_string']);
        self::assertStringContainsString('page=1', $result->getRequest()['query_string']);
    }

    public function testReturnsTheEventNotNull(): void
    {
        $event = Event::createEvent();

        $result = ($this->scrubber)($event);

        self::assertSame($event, $result);
    }
}
