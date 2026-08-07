/**
 * ManagerEffectivenessSection — Displays manager effectiveness data
 * as a table with manager name, team size, completion rate, average
 * team score, and dispute count. Includes a department filter.
 */

import { useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";
import { useManagerEffectiveness } from "../hooks/useManagerEffectiveness";
import { useDepartments } from "../hooks/useDepartments";
import type { ManagerEffectivenessRow } from "@/api/reports";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Format completion rate to one decimal place with a percent sign.
 */
function formatCompletionRate(rate: number): string {
  return `${Number(rate).toFixed(1)}%`;
}

/**
 * Return a Tailwind colour class for the completion rate value.
 * >= 80% green, >= 50% amber, < 50% red.
 */
function getCompletionRateClass(rate: number): string {
  if (rate >= 80) return "text-green-700 font-semibold";
  if (rate >= 50) return "text-amber-700 font-semibold";
  return "text-red-700 font-semibold";
}

/**
 * Format average team score to two decimal places, or em dash for null.
 */
function formatAvgScore(score: number | null): string {
  if (score === null) return "\u2014";
  return Number(score).toFixed(2);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EffectivenessSkeleton() {
  return (
    <div
      className="animate-pulse space-y-3 p-6"
      aria-busy="true"
      aria-label="Loading manager effectiveness data"
    >
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

interface ManagerTableProps {
  managers: ManagerEffectivenessRow[];
}

function ManagerTable({ managers }: ManagerTableProps) {
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full text-sm"
        aria-label="Manager effectiveness table"
      >
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left">
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900">
              Manager
            </th>
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900 text-right">
              Team Size
            </th>
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900 text-right">
              Completion Rate
            </th>
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900 text-right">
              Avg Team Score
            </th>
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900 text-right">
              Disputes
            </th>
          </tr>
        </thead>
        <tbody>
          {managers.map((mgr, i) => (
            <tr
              key={mgr.manager_id}
              className={`border-b border-gray-200 last:border-0 ${
                i % 2 === 1 ? "bg-gray-50" : "bg-white"
              }`}
            >
              <td className="px-6 py-3 text-gray-900 font-medium">
                {mgr.manager_name}
              </td>
              <td className="px-6 py-3 text-right text-gray-500">
                {mgr.team_size}
              </td>
              <td className="px-6 py-3 text-right">
                <span className={getCompletionRateClass(mgr.completion_rate)}>
                  {formatCompletionRate(mgr.completion_rate)}
                </span>
              </td>
              <td className="px-6 py-3 text-right text-gray-500 tabular-nums">
                {formatAvgScore(mgr.avg_team_score)}
              </td>
              <td className="px-6 py-3 text-right">
                {mgr.dispute_count > 0 ? (
                  <Badge
                    variant="outline"
                    className="bg-red-50 text-red-700 border-red-200 text-xs"
                  >
                    {mgr.dispute_count}
                  </Badge>
                ) : (
                  <span className="text-gray-400">0</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ManagerEffectivenessSectionProps {
  cycleId?: string;
}

export function ManagerEffectivenessSection({
  cycleId,
}: ManagerEffectivenessSectionProps) {
  const [departmentId, setDepartmentId] = useState("");

  const { data, isLoading, error, retry } = useManagerEffectiveness({
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

  const isEmpty = data !== null && data.managers.length === 0;

  if (!cycleId) {
    return null;
  }

  return (
    <section aria-label="Manager effectiveness">
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Users
                className="h-5 w-5 text-secondary"
                aria-hidden="true"
              />
              Manager Effectiveness
              {data !== null && (
                <Badge
                  variant="secondary"
                  aria-label={`${data.managers.length} managers`}
                >
                  {data.managers.length}
                </Badge>
              )}
            </CardTitle>
            <div className="w-full sm:w-48">
              <label htmlFor="mgr-dept-filter" className="sr-only">
                Filter by department
              </label>
              <Select
                id="mgr-dept-filter"
                data-testid="mgr-department-filter"
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
          {isLoading && <EffectivenessSkeleton />}

          {/* Empty state */}
          {!isLoading && !error && isEmpty && (
            <div
              className="flex flex-col items-center justify-center py-16 text-center"
              aria-live="polite"
            >
              <Users
                className="h-12 w-12 text-gray-400 mb-3"
                aria-hidden="true"
              />
              <p className="text-base font-medium text-gray-500">
                No manager effectiveness data for this cycle.
              </p>
            </div>
          )}

          {/* Table */}
          {!isLoading && !error && data && data.managers.length > 0 && (
            <ManagerTable managers={data.managers} />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
