/**
 * CareerAspirationPipelineSection — Displays aspired roles as a
 * ranked table sorted by count descending, with rank, role name,
 * count, percentage, and top priority badge.
 */

import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";
import { useCareerAspirationPipeline } from "../hooks/useCareerAspirationPipeline";
import type { AspirationRow } from "@/api/reports";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

type PriorityKey = "FIRST" | "SECOND" | "THIRD";

const PRIORITY_LABELS: Record<PriorityKey, string> = {
  FIRST: "First Priority",
  SECOND: "Second Priority",
  THIRD: "Third Priority",
};

const PRIORITY_STYLES: Record<PriorityKey, string> = {
  FIRST: "bg-green-100 text-green-800",
  SECOND: "bg-blue-100 text-blue-800",
  THIRD: "bg-gray-100 text-gray-700",
};

interface RankedRow {
  rank: number;
  aspiredRole: string;
  count: number;
  percentage: number;
  topPriority: PriorityKey;
}

/**
 * Compute total aspirations to derive per-row percentages.
 */
function computeTotal(rows: AspirationRow[]): number {
  return rows.reduce((sum, r) => sum + r.count, 0);
}

/**
 * Map raw API rows to ranked display rows with percentage.
 * Rows are already sorted descending by count from the API.
 */
function toRankedRows(rows: AspirationRow[], total: number): RankedRow[] {
  return rows.map((row, index) => ({
    rank: index + 1,
    aspiredRole: row.aspired_role,
    count: row.count,
    percentage: total > 0 ? (row.count / total) * 100 : 0,
    topPriority: row.top_priority,
  }));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PipelineSkeleton() {
  return (
    <div
      className="animate-pulse space-y-3 p-6"
      aria-busy="true"
      aria-label="Loading career aspiration data"
    >
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-3/4" />
    </div>
  );
}

interface PriorityBadgeProps {
  priority: PriorityKey;
}

function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_STYLES[priority]}`}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

interface PipelineTableProps {
  rows: RankedRow[];
}

function PipelineTable({ rows }: PipelineTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Career aspiration pipeline">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left">
            <th className="px-6 py-3 font-semibold text-gray-900 w-16">Rank</th>
            <th className="px-6 py-3 font-semibold text-gray-900">Aspired Role</th>
            <th className="px-6 py-3 font-semibold text-gray-900 text-right w-24">Count</th>
            <th className="px-6 py-3 font-semibold text-gray-900 text-right w-28">Percentage</th>
            <th className="px-6 py-3 font-semibold text-gray-900 w-36">Top Priority</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.rank}
              className={`border-b border-gray-200 last:border-0 ${row.rank % 2 === 0 ? "bg-gray-50" : "bg-white"}`}
            >
              <td className="px-6 py-3 text-gray-500 font-medium">{row.rank}</td>
              <td className="px-6 py-3 text-gray-900">{row.aspiredRole}</td>
              <td className="px-6 py-3 text-gray-900 text-right tabular-nums">
                {row.count}
              </td>
              <td className="px-6 py-3 text-gray-500 text-right tabular-nums">
                {Number(row.percentage).toFixed(1)}%
              </td>
              <td className="px-6 py-3">
                <PriorityBadge priority={row.topPriority} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main section
// ---------------------------------------------------------------------------

interface CareerAspirationPipelineSectionProps {
  cycleId?: string;
}

export function CareerAspirationPipelineSection({
  cycleId,
}: CareerAspirationPipelineSectionProps) {
  const { data, isLoading, error, retry } = useCareerAspirationPipeline(cycleId);

  const total = useMemo(
    () => (data ? computeTotal(data.aspired_roles) : 0),
    [data],
  );

  const rankedRows = useMemo(
    () => (data ? toRankedRows(data.aspired_roles, total) : []),
    [data, total],
  );

  const isEmpty = data !== null && data.aspired_roles.length === 0;

  return (
    <section aria-label="Career aspiration pipeline">
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-secondary" aria-hidden="true" />
            Career Aspiration Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Error state */}
          {error && (
            <div
              className="m-6 rounded-md border border-red-200 bg-red-50 px-6 py-4"
              role="alert"
            >
              <p className="text-sm text-red-800">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={retry}
              >
                Retry
              </Button>
            </div>
          )}

          {/* Loading state */}
          {isLoading && <PipelineSkeleton />}

          {/* Empty state */}
          {!isLoading && isEmpty && (
            <div
              className="flex flex-col items-center justify-center py-16 text-center"
              aria-live="polite"
            >
              <TrendingUp
                className="h-12 w-12 text-gray-400 mb-3"
                aria-hidden="true"
              />
              <p className="text-base font-medium text-gray-500">
                No career aspiration data found for this cycle.
              </p>
            </div>
          )}

          {/* Table with ranked roles */}
          {!isLoading && !isEmpty && rankedRows.length > 0 && (
            <PipelineTable rows={rankedRows} />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
