/**
 * ScoreDistributionSection — Displays the performance band distribution
 * as a horizontal bar chart with department, form type, and job family filters.
 */

import { useState, useCallback, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3 } from "lucide-react";
import { useScoreDistribution } from "../hooks/useScoreDistribution";
import { useDepartments } from "../hooks/useDepartments";
import { DistributionFilterBar } from "./DistributionFilterBar";
import { BandBar } from "./BandBar";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DistributionSkeleton() {
  return (
    <div
      className="animate-pulse space-y-4 p-6"
      aria-busy="true"
      aria-label="Loading score distribution"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <div key={n} className="flex items-center gap-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-6 flex-1" />
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ScoreDistributionSectionProps {
  cycleId?: string;
}

export function ScoreDistributionSection({
  cycleId,
}: ScoreDistributionSectionProps) {
  const [departmentId, setDepartmentId] = useState("");
  const [formType, setFormType] = useState<"FORM_A" | "FORM_B" | "">("");
  const [jobFamily, setJobFamily] = useState("");

  const { data, isLoading, error, retry } = useScoreDistribution({
    cycleId,
    departmentId: departmentId || undefined,
    formType,
    jobFamily: jobFamily || undefined,
  });

  const { departments } = useDepartments();

  const handleDepartmentChange = useCallback((value: string) => {
    setDepartmentId(value);
  }, []);

  const handleFormTypeChange = useCallback((value: string) => {
    setFormType(value as "FORM_A" | "FORM_B" | "");
  }, []);

  const handleJobFamilyChange = useCallback((value: string) => {
    setJobFamily(value);
  }, []);

  const sortedBands = useMemo(
    () =>
      data
        ? [...data.bands].sort((a, b) => a.sort_order - b.sort_order)
        : [],
    [data],
  );

  const isEmpty = data !== null && data.bands.length === 0;

  if (!cycleId) {
    return null;
  }

  return (
    <section aria-label="Performance distribution">
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <BarChart3
                  className="h-5 w-5 text-secondary"
                  aria-hidden="true"
                />
                Performance Distribution
                {data !== null && (
                  <Badge
                    variant="secondary"
                    aria-label={`${data.total} total appraisals`}
                  >
                    {data.total}
                  </Badge>
                )}
              </CardTitle>
            </div>
            <DistributionFilterBar
              departmentId={departmentId}
              formType={formType}
              jobFamily={jobFamily}
              departments={departments}
              onDepartmentChange={handleDepartmentChange}
              onFormTypeChange={handleFormTypeChange}
              onJobFamilyChange={handleJobFamilyChange}
            />
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
          {isLoading && <DistributionSkeleton />}

          {/* Empty state */}
          {!isLoading && !error && isEmpty && (
            <div
              className="flex flex-col items-center justify-center py-16 text-center"
              aria-live="polite"
            >
              <BarChart3
                className="h-12 w-12 text-gray-400 mb-3"
                aria-hidden="true"
              />
              <p className="text-base font-medium text-gray-500">
                No finalised appraisals in this cycle.
              </p>
            </div>
          )}

          {/* Band bars */}
          {!isLoading && !error && data && data.bands.length > 0 && (
            <div
              className="px-6 py-5 space-y-3"
              role="list"
              aria-label="Score distribution bands"
            >
              {sortedBands.map((band) => (
                <BandBar key={band.label} band={band} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
