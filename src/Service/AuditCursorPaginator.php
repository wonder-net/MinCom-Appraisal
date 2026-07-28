<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\AuditLog;
use App\Repository\AuditLogRepository;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Uid\Uuid;

/**
 * Port of AuditCursorPagination (DRF's opaque CursorPagination, ordered
 * `-timestamp`, page_size=50). The frontend treats the `cursor` value
 * as fully opaque — it only ever round-trips whatever this backend
 * returns, extracting the `cursor` query param from a full URL — so
 * this cursor's on-the-wire encoding doesn't need to match DRF's own
 * scheme, only be internally consistent.
 *
 * Cursor format: base64url(json{"d": "n"|"p", "t": <ISO8601 timestamp>,
 * "i": <uuid>}) — "d" is the navigation direction (n=next/older,
 * p=previous/newer) relative to the encoded (t, i) boundary position,
 * which disambiguates ties since `timestamp` alone isn't unique.
 */
final class AuditCursorPaginator
{
    public const PAGE_SIZE = 50;

    public function __construct(private readonly AuditLogRepository $auditLogs)
    {
    }

    /**
     * @param array<string, mixed> $filters
     * @return array{items: list<AuditLog>, next: ?string, previous: ?string}|null null when the cursor is malformed
     */
    public function paginate(Request $request, array $filters): ?array
    {
        $rawCursor = $request->query->get('cursor');
        $decoded = null;
        if ($rawCursor !== null) {
            $decoded = $this->decodeCursor($rawCursor);
            if ($decoded === null) {
                return null;
            }
        }

        if ($decoded === null || $decoded['dir'] === 'n') {
            return $this->paginateForward($filters, $decoded['position'] ?? null, $decoded !== null, $request);
        }

        return $this->paginateBackward($filters, $decoded['position'], $request);
    }

    /**
     * @param array<string, mixed> $filters
     * @param array{ts: \DateTimeImmutable, id: Uuid}|null $position
     * @return array{items: list<AuditLog>, next: ?string, previous: ?string}
     */
    private function paginateForward(array $filters, ?array $position, bool $cameFromCursor, Request $request): array
    {
        $rows = $this->auditLogs->findPage($filters, $position, self::PAGE_SIZE + 1);
        $hasMore = count($rows) > self::PAGE_SIZE;
        $page = array_slice($rows, 0, self::PAGE_SIZE);

        $next = null;
        if ($hasMore && $page !== []) {
            $last = $page[array_key_last($page)];
            $next = $this->buildUrl($request, $this->encodeCursor('n', $last));
        }

        $previous = null;
        if ($cameFromCursor && $page !== []) {
            $first = $page[array_key_first($page)];
            $previous = $this->buildUrl($request, $this->encodeCursor('p', $first));
        }

        return ['items' => $page, 'next' => $next, 'previous' => $previous];
    }

    /**
     * @param array<string, mixed> $filters
     * @param array{ts: \DateTimeImmutable, id: Uuid} $position
     * @return array{items: list<AuditLog>, next: ?string, previous: ?string}
     */
    private function paginateBackward(array $filters, array $position, Request $request): array
    {
        $rows = $this->auditLogs->findPageBefore($filters, $position, self::PAGE_SIZE + 1);
        $hasMore = count($rows) > self::PAGE_SIZE;
        // $rows is ASC (oldest-of-the-newer-than-boundary-set first) —
        // i.e. closest to the boundary first. Trim the farthest one
        // (if present) before reversing back to newest-first display
        // order, matching keyset pagination's standard "peek ahead,
        // trim, then orient for display" approach.
        $trimmed = array_slice($rows, 0, self::PAGE_SIZE);
        $page = array_reverse($trimmed);

        $next = null;
        if ($page !== []) {
            $last = $page[array_key_last($page)];
            $next = $this->buildUrl($request, $this->encodeCursor('n', $last));
        }

        $previous = null;
        if ($hasMore && $page !== []) {
            $first = $page[array_key_first($page)];
            $previous = $this->buildUrl($request, $this->encodeCursor('p', $first));
        }

        return ['items' => $page, 'next' => $next, 'previous' => $previous];
    }

    private function encodeCursor(string $direction, AuditLog $entry): string
    {
        $payload = json_encode(['d' => $direction, 't' => $entry->getTimestamp()->format(\DateTimeInterface::ATOM), 'i' => (string) $entry->getId()], \JSON_THROW_ON_ERROR);

        return rtrim(strtr(base64_encode($payload), '+/', '-_'), '=');
    }

    /**
     * @return array{dir: string, position: array{ts: \DateTimeImmutable, id: Uuid}}|null
     */
    private function decodeCursor(string $raw): ?array
    {
        $base64 = strtr($raw, '-_', '+/');
        $base64 .= str_repeat('=', (4 - strlen($base64) % 4) % 4);
        $json = base64_decode($base64, true);
        if ($json === false) {
            return null;
        }

        $data = json_decode($json, true);
        if (!is_array($data) || !isset($data['d'], $data['t'], $data['i']) || !in_array($data['d'], ['n', 'p'], true)) {
            return null;
        }

        try {
            $ts = new \DateTimeImmutable($data['t']);
            $id = Uuid::fromString($data['i']);
        } catch (\Throwable) {
            return null;
        }

        return ['dir' => $data['d'], 'position' => ['ts' => $ts, 'id' => $id]];
    }

    private function buildUrl(Request $request, string $cursor): string
    {
        $query = $request->query->all();
        $query['cursor'] = $cursor;
        $queryString = http_build_query($query);

        return $request->getSchemeAndHttpHost().$request->getPathInfo().($queryString !== '' ? '?'.$queryString : '');
    }
}
