/**
 * DepartmentDrillDown — slide-in panel displaying detailed department
 * appraisal statistics. Returns null when deptId is null.
 */

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useDepartmentReport } from "../hooks/useDepartmentReport";
import type { DepartmentReport } from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  SELF_ASSESSMENT: "Self Assessment",
  MANAGER_REVIEW: "Manager Review",
  DISCUSSION: "Discussion",
  GROWTH_PLANNING: "Growth Planning",
  PENDING_SIGNOFF: "Pending Sign-off",
  SIGNED_OFF: "Signed Off",
  FINALISED: "Finalised",
  EXCLUDED: "Excluded",
  INCOMPLETE: "Incomplete",
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  SELF_ASSESSMENT: "bg-blue-50 text-blue-700 border-blue-200",
  MANAGER_REVIEW: "bg-amber-50 text-amber-700 border-amber-200",
  DISCUSSION: "bg-purple-50 text-purple-700 border-purple-200",
  GROWTH_PLANNING: "bg-teal-50 text-teal-700 border-teal-200",
  PENDING_SIGNOFF: "bg-orange-50 text-orange-700 border-orange-200",
  SIGNED_OFF: "bg-green-50 text-green-700 border-green-300",
  FINALISED: "bg-primary-light text-primary border-primary",
  EXCLUDED: "bg-red-50 text-red-700 border-red-200",
  INCOMPLETE: "bg-gray-50 text-gray-500 border-gray-300",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DepartmentDrillDownProps {
  deptId: string | null;
  cycleId?: string;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function formatScore(score: string | number | null): string {
  if (score === null || score === undefined) return "\u2014";
  return Number(score).toFixed(2);
}

function formatCompletionRate(rate: string | number): string {
  return `${Number(rate).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DrillDownSkeleton() {
  return (
    <div
      className="space-y-4"
      aria-busy="true"
      aria-label="Loading department data"
    >
      <Skeleton className="h-6 w-48" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
      <Skeleton className="h-4 w-32" />
      {[1, 2, 3].map((n) => (
        <div key={n} className="flex gap-4">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

function StatusBreakdownTable({
  data,
}: {
  data: DepartmentReport;
}) {
  const entries = useMemo(
    () =>
      Object.entries(data.appraisals_by_status).map(
        ([status, count]) => ({ status, count }),
      ),
    [data.appraisals_by_status],
  );

  const total = useMemo(
    () => entries.reduce((sum, entry) => sum + entry.count, 0),
    [entries],
  );

  if (entries.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4 text-center">
        No appraisal data for this department.
      </p>
    );
  }

  return (
    <table
      className="w-full text-sm"
      aria-label="Department status breakdown"
    >
      <thead>
        <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100 bg-gray-50">
          <th
            scope="col"
            className="px-3 py-2 text-left font-semibold"
          >
            Status
          </th>
          <th
            scope="col"
            className="px-3 py-2 text-right font-semibold"
          >
            Count
          </th>
          <th
            scope="col"
            className="px-3 py-2 text-right font-semibold"
          >
            %
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {entries.map((entry, i) => {
          const pct =
            total > 0
              ? ((entry.count / total) * 100).toFixed(1)
              : "0.0";
          return (
            <tr
              key={entry.status}
              className={`${
                i % 2 === 1 ? "bg-gray-50" : "bg-white"
              }`}
            >
              <td className="px-3 py-2">
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    STATUS_BADGE_CLASSES[entry.status] ?? ""
                  }`}
                >
                  {STATUS_LABELS[entry.status] ?? entry.status}
                </Badge>
              </td>
              <td className="px-3 py-2 text-right font-semibold text-gray-900">
                {entry.count}
              </td>
              <td className="px-3 py-2 text-right text-gray-500">
                {pct}%
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DepartmentDrillDown({
  deptId,
  cycleId,
  onClose,
}: DepartmentDrillDownProps) {
  const { data, isLoading, error, retry } = useDepartmentReport(deptId, cycleId);

  if (!deptId) {
    return null;
  }

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-white shadow-xl border-l border-gray-200 transform transition-transform duration-200 ease-in-out translate-x-0 overflow-y-auto"
      aria-label="Department drill-down panel"
      role="complementary"
    >
      <div className="px-6 py-4">
        {/* Header with close button */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Department Details
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close department panel"
          >
            Close
          </Button>
        </div>

        {/* Loading state */}
        {isLoading && <DrillDownSkeleton />}

        {/* Error state */}
        {error && !isLoading && (
          <Alert variant="error" className="mb-4">
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={retry}
                aria-label="Retry loading department data"
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Populated state */}
        {data && !isLoading && !error && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-gray-900">
              {data.department_name}
            </h3>

            {/* Summary metrics */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="shadow-sm">
                <CardContent className="px-4 py-3">
                  <p className="text-xs font-medium text-gray-500">
                    Employees
                  </p>
                  <p className="text-xl font-bold text-gray-900">
                    {data.employee_count}
                  </p>
                </CardContent>
              </Card>
              <Card className="shadow-sm">
                <CardContent className="px-4 py-3">
                  <p className="text-xs font-medium text-gray-500">
                    Completion
                  </p>
                  <p
                    className={`text-xl font-bold ${
                      Number(data.completion_rate) >= 70
                        ? "text-green-700"
                        : "text-amber-700"
                    }`}
                  >
                    {formatCompletionRate(data.completion_rate)}
                  </p>
                </CardContent>
              </Card>
              <Card className="shadow-sm col-span-2">
                <CardContent className="px-4 py-3">
                  <p className="text-xs font-medium text-gray-500">
                    Average Score
                  </p>
                  <p className="text-xl font-bold text-gray-900">
                    {formatScore(data.avg_total_score)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Status breakdown */}
            <Card className="shadow-sm">
              <CardHeader className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                <CardTitle className="text-sm font-semibold text-gray-900">
                  Status Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <StatusBreakdownTable data={data} />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </aside>
  );
}
