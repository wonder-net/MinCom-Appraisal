/**
 * SelfVsManagerVarianceSection — Displays self vs manager rating variance
 * as two tables: KD Variance and Competency Variance. When self-rating is
 * disabled for the cycle, shows an informational banner instead.
 */

import { useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeftRight } from "lucide-react";
import { useSelfVsManagerVariance } from "../hooks/useSelfVsManagerVariance";
import { useDepartments } from "../hooks/useDepartments";
import { KDVarianceTable } from "./KDVarianceTable";
import { CompetencyVarianceTable } from "./CompetencyVarianceTable";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function VarianceSkeleton() {
  return (
    <div
      className="animate-pulse space-y-3 p-6"
      aria-busy="true"
      aria-label="Loading rating variance data"
    >
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

function SelfRatingDisabledBanner() {
  return (
    <div
      className="rounded-md p-4 bg-amber-50 border border-amber-300 text-sm text-amber-800 flex items-center gap-2"
      role="status"
      data-testid="self-rating-disabled-banner"
    >
      <span aria-hidden="true">&#9888;</span>
      Self-ratings are not enabled for this cycle.
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface SelfVsManagerVarianceSectionProps {
  cycleId?: string;
}

export function SelfVsManagerVarianceSection({
  cycleId,
}: SelfVsManagerVarianceSectionProps) {
  const [departmentId, setDepartmentId] = useState("");

  const { data, isLoading, error, retry } = useSelfVsManagerVariance({
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

  if (!cycleId) {
    return null;
  }

  const selfRatingDisabled = data !== null && !data.self_rating_enabled;
  const hasKDData = data !== null && data.kd_variances.length > 0;
  const hasCompetencyData =
    data !== null && data.competency_variances.length > 0;
  const isEmpty =
    data !== null &&
    data.self_rating_enabled &&
    data.kd_variances.length === 0 &&
    data.competency_variances.length === 0;

  return (
    <section aria-label="Self vs manager rating variance">
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <ArrowLeftRight
                className="h-5 w-5 text-secondary"
                aria-hidden="true"
              />
              Rating Variance
            </CardTitle>
            {!selfRatingDisabled && (
              <div className="w-full sm:w-48">
                <label htmlFor="variance-dept-filter" className="sr-only">
                  Filter by department
                </label>
                <Select
                  id="variance-dept-filter"
                  data-testid="variance-department-filter"
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
            )}
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {/* Error state */}
          {error && (
            <div
              className="rounded-md border border-red-200 bg-red-50 px-6 py-4"
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
          {isLoading && <VarianceSkeleton />}

          {/* Self-rating disabled banner */}
          {!isLoading && !error && selfRatingDisabled && (
            <SelfRatingDisabledBanner />
          )}

          {/* Empty state */}
          {!isLoading && !error && isEmpty && (
            <div
              className="flex flex-col items-center justify-center py-16 text-center"
              aria-live="polite"
            >
              <ArrowLeftRight
                className="h-12 w-12 text-gray-400 mb-3"
                aria-hidden="true"
              />
              <p className="text-base font-medium text-gray-500">
                No rating variance data for this cycle.
              </p>
            </div>
          )}

          {/* Tables */}
          {!isLoading && !error && data && data.self_rating_enabled && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {hasKDData && (
                <KDVarianceTable rows={data.kd_variances} />
              )}
              {hasCompetencyData && (
                <CompetencyVarianceTable
                  rows={data.competency_variances}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
