/**
 * BSCPerspectiveSection — Displays the BSC perspective breakdown
 * as rows with perspective name, average weighted score, and
 * appraisal count. Includes a department filter dropdown.
 */

import { useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Layers } from "lucide-react";
import { useBSCPerspectives } from "../hooks/useBSCPerspectives";
import { useDepartments } from "../hooks/useDepartments";
import type { BSCPerspectiveRow } from "@/api/reports";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Map a perspective name to a Tailwind colour class set.
 * Falls back to gray for unknown perspectives.
 */
function getPerspectiveClasses(name: string): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  const lower = name.toLowerCase();
  if (lower.includes("financial")) {
    return { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" };
  }
  if (lower.includes("customer")) {
    return { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", dot: "bg-green-500" };
  }
  if (lower.includes("internal")) {
    return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" };
  }
  if (lower.includes("learning")) {
    return { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", dot: "bg-purple-500" };
  }
  return { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200", dot: "bg-gray-500" };
}

/**
 * Format average weighted score to 2 decimal places,
 * or return a dash for null values.
 */
function formatScore(score: number | null): string {
  if (score === null) return "\u2014";
  return Number(score).toFixed(2);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PerspectiveSkeleton() {
  return (
    <div
      className="animate-pulse space-y-3 p-6"
      aria-busy="true"
      aria-label="Loading BSC perspective breakdown"
    >
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className="flex items-center gap-4">
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-16 ml-auto" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

function PerspectiveRow({ perspective }: { perspective: BSCPerspectiveRow }) {
  const classes = getPerspectiveClasses(perspective.perspective_name);

  return (
    <div
      role="listitem"
      className={`flex items-center gap-4 rounded-md border px-4 py-3 ${classes.bg} ${classes.border}`}
    >
      <span
        className={`h-3 w-3 rounded-full flex-shrink-0 ${classes.dot}`}
        aria-hidden="true"
      />
      <span className={`text-sm font-medium flex-1 ${classes.text}`}>
        {perspective.perspective_name}
      </span>
      <span
        className={`text-sm font-semibold tabular-nums ${classes.text}`}
        aria-label={`Average score: ${formatScore(perspective.avg_weighted_score)}`}
      >
        {formatScore(perspective.avg_weighted_score)}
      </span>
      <span
        className="text-xs text-gray-500 w-24 text-right"
        aria-label={`${perspective.appraisal_count} appraisals`}
      >
        {perspective.appraisal_count} appraisal{perspective.appraisal_count !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface BSCPerspectiveSectionProps {
  cycleId?: string;
}

export function BSCPerspectiveSection({
  cycleId,
}: BSCPerspectiveSectionProps) {
  const [departmentId, setDepartmentId] = useState("");

  const { data, isLoading, error, retry } = useBSCPerspectives({
    cycleId,
    departmentId: departmentId || undefined,
  });

  const { departments } = useDepartments();

  const handleDepartmentChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setDepartmentId(e.target.value);
    },
    [],
  );

  const isEmpty = data !== null && data.perspectives.length === 0;

  if (!cycleId) {
    return null;
  }

  return (
    <section aria-label="BSC perspective breakdown">
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Layers
                  className="h-5 w-5 text-secondary"
                  aria-hidden="true"
                />
                BSC Perspective Breakdown
              </CardTitle>
              <div className="w-full sm:w-48">
                <label htmlFor="bsc-dept-filter" className="sr-only">
                  Filter by department
                </label>
                <Select
                  id="bsc-dept-filter"
                  data-testid="bsc-department-filter"
                  value={departmentId}
                  onChange={handleDepartmentChange}
                  aria-label="Filter by department"
                >
                  <option value="">All Departments</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
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
          {isLoading && <PerspectiveSkeleton />}

          {/* Empty state */}
          {!isLoading && !error && isEmpty && (
            <div
              className="flex flex-col items-center justify-center py-16 text-center"
              aria-live="polite"
            >
              <Layers
                className="h-12 w-12 text-gray-400 mb-3"
                aria-hidden="true"
              />
              <p className="text-base font-medium text-gray-500">
                No finalised appraisals with KD data.
              </p>
            </div>
          )}

          {/* Perspective rows */}
          {!isLoading && !error && data && data.perspectives.length > 0 && (
            <div
              className="px-6 py-5 space-y-3"
              role="list"
              aria-label="BSC perspectives"
            >
              {data.perspectives.map((perspective) => (
                <PerspectiveRow
                  key={perspective.perspective_id}
                  perspective={perspective}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
