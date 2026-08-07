/**
 * CompetencyGapSection — Displays competency gaps as a table sorted
 * by lowest average manager rating first. Includes a form type
 * segmented control filter (All | Form A | Form B) managed locally.
 */

import { useState, useCallback, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Target } from "lucide-react";
import { useCompetencyGaps } from "../hooks/useCompetencyGaps";
import type { CompetencyGapRow } from "@/api/reports";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Format average manager rating to one decimal place.
 */
function formatRating(rating: number): string {
  return Number(rating).toFixed(1);
}

/**
 * Return a Tailwind colour class for the rating value.
 * Red below 3, amber 3-4, green above 4.
 */
function ratingColorClass(rating: number): string {
  if (rating < 3) return "text-red-700";
  if (rating <= 4) return "text-amber-700";
  return "text-green-700";
}

/**
 * Return a background highlight class for the rating cell.
 */
function ratingBgClass(rating: number): string {
  if (rating < 3) return "bg-red-50";
  if (rating <= 4) return "bg-amber-50";
  return "bg-green-50";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormTypeFilter = "ALL" | "FORM_A" | "FORM_B";

interface FormTypeOption {
  value: FormTypeFilter;
  label: string;
}

const FORM_TYPE_OPTIONS: FormTypeOption[] = [
  { value: "ALL", label: "All" },
  { value: "FORM_A", label: "Form A" },
  { value: "FORM_B", label: "Form B" },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CompetencyGapSkeleton() {
  return (
    <div
      className="animate-pulse space-y-3 p-6"
      aria-busy="true"
      aria-label="Loading competency gap report"
    >
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

interface FormTypeSegmentedControlProps {
  value: FormTypeFilter;
  onChange: (value: FormTypeFilter) => void;
}

function FormTypeSegmentedControl({
  value,
  onChange,
}: FormTypeSegmentedControlProps) {
  return (
    <div
      className="inline-flex rounded-md border border-gray-300 bg-gray-100 p-0.5"
      role="radiogroup"
      aria-label="Filter by form type"
    >
      {FORM_TYPE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          data-testid={`form-type-${option.value.toLowerCase()}`}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            value === option.value
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface CompetencyGapTableProps {
  gaps: CompetencyGapRow[];
}

function CompetencyGapTable({ gaps }: CompetencyGapTableProps) {
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full text-sm"
        aria-label="Competency gap table"
      >
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left">
            <th
              scope="col"
              className="px-6 py-3 font-semibold text-gray-900 w-12"
            >
              #
            </th>
            <th
              scope="col"
              className="px-6 py-3 font-semibold text-gray-900"
            >
              Competency
            </th>
            <th
              scope="col"
              className="px-6 py-3 font-semibold text-gray-900 text-right"
            >
              Avg. Rating
            </th>
            <th
              scope="col"
              className="px-6 py-3 font-semibold text-gray-900 text-right"
            >
              Rated Count
            </th>
          </tr>
        </thead>
        <tbody>
          {gaps.map((gap, index) => {
            const isLowest = index === 0;
            return (
              <tr
                key={gap.competency_id}
                data-testid={`gap-row-${gap.competency_id}`}
                aria-label={
                  isLowest
                    ? `Lowest rated competency: ${gap.competency_name}`
                    : undefined
                }
                className={`border-b border-gray-200 last:border-0 ${
                  isLowest
                    ? "bg-red-50"
                    : index % 2 === 1
                      ? "bg-gray-50"
                      : "bg-white"
                }`}
              >
                <td className="px-6 py-3 text-gray-500 tabular-nums">
                  {index + 1}
                </td>
                <td className="px-6 py-3">
                  <span className="font-medium text-gray-900">
                    {gap.competency_name}
                  </span>
                </td>
                <td className="px-6 py-3 text-right">
                  <span
                    className={`inline-flex items-center rounded px-2 py-0.5 text-sm font-semibold tabular-nums ${ratingColorClass(gap.avg_manager_rating)} ${ratingBgClass(gap.avg_manager_rating)}`}
                    aria-label={`Average rating: ${formatRating(gap.avg_manager_rating)}`}
                  >
                    {formatRating(gap.avg_manager_rating)}
                  </span>
                </td>
                <td className="px-6 py-3 text-right text-gray-500 tabular-nums">
                  {gap.appraisal_count}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CompetencyGapSectionProps {
  cycleId?: string;
}

export function CompetencyGapSection({
  cycleId,
}: CompetencyGapSectionProps) {
  const [formTypeFilter, setFormTypeFilter] =
    useState<FormTypeFilter>("ALL");

  const hookFormType = useMemo(
    () =>
      formTypeFilter === "ALL" ? undefined : formTypeFilter,
    [formTypeFilter],
  );

  const { data, isLoading, error, retry } = useCompetencyGaps({
    cycleId,
    formType: hookFormType,
  });

  const handleFormTypeChange = useCallback(
    (value: FormTypeFilter) => {
      setFormTypeFilter(value);
    },
    [],
  );

  const isEmpty = data !== null && data.gaps.length === 0;

  if (!cycleId) {
    return null;
  }

  return (
    <section aria-label="Competency gap report">
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Target
                className="h-5 w-5 text-secondary"
                aria-hidden="true"
              />
              Competency Gaps
              {data !== null && data.gaps.length > 0 && (
                <Badge
                  variant="secondary"
                  aria-label={`${data.gaps.length} competencies`}
                >
                  {data.gaps.length}
                </Badge>
              )}
            </CardTitle>
            <FormTypeSegmentedControl
              value={formTypeFilter}
              onChange={handleFormTypeChange}
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
          {isLoading && <CompetencyGapSkeleton />}

          {/* Empty state */}
          {!isLoading && !error && isEmpty && (
            <div
              className="flex flex-col items-center justify-center py-16 text-center"
              aria-live="polite"
            >
              <Target
                className="h-12 w-12 text-gray-400 mb-3"
                aria-hidden="true"
              />
              <p className="text-base font-medium text-gray-500">
                No competency gap data available for this cycle.
              </p>
            </div>
          )}

          {/* Table */}
          {!isLoading && !error && data && data.gaps.length > 0 && (
            <CompetencyGapTable gaps={data.gaps} />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
