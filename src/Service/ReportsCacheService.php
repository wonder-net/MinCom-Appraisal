<?php

declare(strict_types=1);

namespace App\Service;

use Symfony\Contracts\Cache\ItemInterface;
use Symfony\Contracts\Cache\TagAwareCacheInterface;

/**
 * Port of the reports app's cache-aside layer plus
 * apps.appraisals.workflow.{_invalidate_dashboard_cache,
 * _invalidate_report_caches}. Cache keys translate Django's `:` to `.`
 * (PSR-6 forbids `:` in keys — same substitution CycleListCache already
 * established).
 *
 * Django's `delete_pattern("{prefix}:*")` (a django-redis extension,
 * glob-deleting every cycle/department variant of six report types at
 * once) has no PSR-6 equivalent. Symfony's tag-aware cache pool
 * (`cache.app.taggable`, available with no new dependency or Redis
 * requirement) replaces it: every score_dist/bsc-perspectives/
 * manager_effectiveness/competency_gaps/trend/variance cache entry is
 * tagged `reports`, and `invalidateReports()` calls `invalidateTags(['reports'])`
 * to reproduce that same blanket invalidation. dashboard/department/
 * unapprised/training_needs entries are targeted single-key deletes in
 * Django (not glob), so those stay plain keyed deletes here too.
 */
final class ReportsCacheService
{
    public const DEFAULT_TTL_SECONDS = 300;
    public const REPORTS_TAG = 'reports';

    public function __construct(private readonly TagAwareCacheInterface $cache)
    {
    }

    /**
     * Get-or-compute a cache entry. Pass self::REPORTS_TAG in $tags for
     * any of the six glob-invalidated report types (score distribution,
     * BSC perspectives, manager effectiveness, competency gaps, trend,
     * variance) so invalidateReports() can bust them; omit it for
     * dashboard/department/unapprised/training-needs entries, which are
     * busted by exact key instead.
     *
     * @param list<string> $tags
     */
    public function get(string $key, array $tags, callable $compute, int $ttl = self::DEFAULT_TTL_SECONDS): mixed
    {
        return $this->cache->get($key, function (ItemInterface $item) use ($tags, $compute, $ttl) {
            $item->expiresAfter($ttl);
            if ($tags !== []) {
                $item->tag($tags);
            }

            return $compute();
        });
    }

    public function invalidateDashboard(?string $cycleId): void
    {
        $this->cache->delete('dashboard.stats.'.($cycleId ?? 'none'));
    }

    public function invalidateReports(?string $cycleId, ?string $departmentId): void
    {
        $this->invalidateDashboard($cycleId);

        if ($departmentId !== null) {
            $this->cache->delete('department.stats.'.$departmentId.'.'.($cycleId ?? 'none'));
        }

        $cid = $cycleId ?? 'none';
        $this->cache->delete('unapprised.'.$cid.'.none');
        $this->cache->delete('unapprised.none.none');
        $this->cache->delete('training_needs.'.$cid);
        $this->cache->delete('training_needs.none');

        $this->cache->invalidateTags([self::REPORTS_TAG]);
    }

    public function invalidateAppraisalPdf(string $appraisalId): void
    {
        $this->cache->delete('pdf.appraisal.'.$appraisalId);
    }
}
