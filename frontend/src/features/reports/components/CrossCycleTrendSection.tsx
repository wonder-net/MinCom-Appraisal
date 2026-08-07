/**
 * CrossCycleTrendSection — displays the cross-cycle trend report
 * as an SVG line chart with a department filter dropdown. Shows
 * loading, error, and empty states.
 */

import { useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";
import { useCrossCycleTrend } from "../hooks/useCrossCycleTrend";
import { useDepartments } from "../hooks/useDepartments";
import { TrendLineChart } from "./TrendLineChart";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TrendSkeleton() {
  return (
    <div
      className="animate-pulse space-y-4 p-6"
      aria-busy="true"
      aria-label="Loading cross-cycle trend data"
    >
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-[200px] w-full rounded-md" />
      <div className="flex justify-between">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CrossCycleTrendSectionProps {
  departmentId?: string;
}

export function CrossCycleTrendSection({
  departmentId: initialDepartmentId,
}: CrossCycleTrendSectionProps) {
  const [departmentId, setDepartmentId] = useState(
    initialDepartmentId ?? "",
  );

  const { data, isLoading, error, retry } = useCrossCycleTrend(
    departmentId || undefined,
  );

  const { departments } = useDepartments();

  const handleDepartmentChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setDepartmentId(e.target.value);
    },
    [],
  );

  const isEmpty = data !== null && data.data_points.length === 0;
  const hasData = data !== null && data.data_points.length > 0;

  return (
    <section aria-label="Cross-cycle performance trend">
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp
                className="h-5 w-5 text-secondary"
                aria-hidden="true"
              />
              Cross-Cycle Performance Trend
            </CardTitle>
            <div className="w-full sm:w-48">
              <label htmlFor="trend-dept-filter" className="sr-only">
                Filter by department
              </label>
              <Select
                id="trend-dept-filter"
                data-testid="trend-department-filter"
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
          {isLoading && <TrendSkeleton />}

          {/* Empty state */}
          {!isLoading && !error && isEmpty && (
            <div
              className="flex flex-col items-center justify-center py-16 text-center"
              aria-live="polite"
            >
              <TrendingUp
                className="h-12 w-12 text-gray-400 mb-3"
                aria-hidden="true"
              />
              <p className="text-base font-medium text-gray-500">
                No closed cycles found.
              </p>
              <p className="text-sm text-gray-400 mt-1">
                Trend data will appear once cycles are closed.
              </p>
            </div>
          )}

          {/* Chart */}
          {!isLoading && !error && hasData && (
            <div className="px-6 py-5">
              <TrendLineChart dataPoints={data.data_points} />
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
