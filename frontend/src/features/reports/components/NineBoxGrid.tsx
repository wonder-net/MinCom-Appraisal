/**
 * NineBoxGrid — Renders the 9-box talent grid: performance (rows,
 * HIGH at top) x potential (columns, LOW to HIGH left-to-right),
 * standard 9-box reading convention. Renders inline on the 9-box
 * report page. Handles loading, error, empty, and 403 states.
 */

import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Grid3x3, ShieldAlert } from "lucide-react";
import { useNineBox } from "../hooks/useNineBox";
import type { NineBoxCell, NineBoxEmployee, NineBoxTier } from "@/api/reports";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const PERFORMANCE_ROWS: readonly NineBoxTier[] = ["HIGH", "MEDIUM", "LOW"];
const POTENTIAL_COLS: readonly NineBoxTier[] = ["LOW", "MEDIUM", "HIGH"];

const TIER_LABELS: Record<NineBoxTier, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

/**
 * Standard 9-box cell naming — illustrative labels, not a fixed HR
 * framework; easy to relabel later if MINCOM wants different terms.
 */
const CELL_LABELS: Record<string, string> = {
  "HIGH|HIGH": "Star",
  "HIGH|MEDIUM": "High Performer",
  "HIGH|LOW": "Solid Performer",
  "MEDIUM|HIGH": "Future Star",
  "MEDIUM|MEDIUM": "Core Player",
  "MEDIUM|LOW": "Average Performer",
  "LOW|HIGH": "Rough Diamond",
  "LOW|MEDIUM": "Inconsistent Player",
  "LOW|LOW": "Underperformer",
};

function cellBackground(performance: NineBoxTier, potential: NineBoxTier): string {
  const score = (["LOW", "MEDIUM", "HIGH"].indexOf(performance) + 1) * (["LOW", "MEDIUM", "HIGH"].indexOf(potential) + 1);
  if (score >= 6) return "bg-emerald-50 border-emerald-200";
  if (score >= 3) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-3 p-6" aria-busy="true" aria-label="Loading 9-box grid">
      {Array.from({ length: 9 }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
    </div>
  );
}

function GridCellCard({ cell }: { cell: NineBoxCell }) {
  const label = CELL_LABELS[`${cell.performance}|${cell.potential}`];

  return (
    <div
      className={`rounded-md border p-3 min-h-[130px] flex flex-col ${cellBackground(cell.performance, cell.potential)}`}
      aria-label={`${TIER_LABELS[cell.performance]} performance, ${TIER_LABELS[cell.potential]} potential: ${cell.count} employee${cell.count === 1 ? "" : "s"}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700">{label}</span>
        <Badge variant="outline" className="text-xs bg-white">
          {cell.count}
        </Badge>
      </div>
      <ul className="space-y-0.5 overflow-y-auto flex-1">
        {cell.employees.map((emp) => (
          <li key={emp.appraisal_id} className="text-xs">
            <Link to={`/appraisals/${emp.appraisal_id}`} className="text-primary hover:underline">
              {emp.employee_name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface NineBoxGridProps {
  cycleId?: string;
}

export function NineBoxGrid({ cycleId }: NineBoxGridProps) {
  const { data, isLoading, error, isForbidden, retry } = useNineBox(cycleId);

  const isEmpty = data !== null && data.total_finalised === 0;
  const cellByKey = new Map(data?.grid.map((cell) => [`${cell.performance}|${cell.potential}`, cell]) ?? []);

  return (
    <section aria-label="9-box talent grid">
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Grid3x3 className="h-5 w-5 text-secondary" aria-hidden="true" />
            9-Box Talent Grid
          </CardTitle>
          <p className="text-xs text-gray-500 mt-1">
            Performance (this cycle&rsquo;s finalized score) vs. potential (set by the
            manager on the growth plan). Only finalized appraisals are included.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {/* 403 Forbidden state */}
          {isForbidden && (
            <div className="m-6 flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-6 py-4" role="status">
              <ShieldAlert className="h-5 w-5 text-amber-600 flex-shrink-0" aria-hidden="true" />
              <p className="text-sm text-amber-800">You do not have permission to view this report.</p>
            </div>
          )}

          {/* Error state */}
          {error && !isForbidden && (
            <div className="m-6 rounded-md border border-red-200 bg-red-50 px-6 py-4" role="alert">
              <p className="text-sm text-red-800">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
                Retry
              </Button>
            </div>
          )}

          {/* Loading state */}
          {isLoading && <GridSkeleton />}

          {/* Empty state */}
          {!isLoading && !error && !isForbidden && isEmpty && (
            <div className="flex flex-col items-center justify-center py-16 text-center" aria-live="polite">
              <Grid3x3 className="h-12 w-12 text-gray-400 mb-3" aria-hidden="true" />
              <p className="text-base font-medium text-gray-500">
                No finalized appraisals in this cycle yet.
              </p>
            </div>
          )}

          {/* Grid */}
          {!isLoading && !error && !isForbidden && data && !isEmpty && (
            <div className="p-6">
              <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-3">
                <div />
                {POTENTIAL_COLS.map((p) => (
                  <div key={p} className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {TIER_LABELS[p]} Potential
                  </div>
                ))}
                {PERFORMANCE_ROWS.map((performance) => (
                  <>
                    <div
                      key={`label-${performance}`}
                      className="flex items-center justify-end pr-2 text-xs font-semibold text-gray-500 uppercase tracking-wide [writing-mode:vertical-rl] rotate-180 sm:[writing-mode:horizontal-tb] sm:rotate-0"
                    >
                      {TIER_LABELS[performance]} Performance
                    </div>
                    {POTENTIAL_COLS.map((potential) => {
                      const cell = cellByKey.get(`${performance}|${potential}`);
                      return cell ? (
                        <GridCellCard key={`${performance}-${potential}`} cell={cell} />
                      ) : (
                        <div key={`${performance}-${potential}`} />
                      );
                    })}
                  </>
                ))}
              </div>

              {data.unrated_count > 0 && (
                <div className="mt-6 rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-semibold text-gray-600 mb-2">
                    {data.unrated_count} finalized employee{data.unrated_count === 1 ? "" : "s"} not shown — no
                    potential rating set on their growth plan:
                  </p>
                  <ul className="flex flex-wrap gap-x-4 gap-y-1">
                    {data.unrated_employees.map((emp: NineBoxEmployee) => (
                      <li key={emp.appraisal_id} className="text-xs">
                        <Link to={`/appraisals/${emp.appraisal_id}`} className="text-primary hover:underline">
                          {emp.employee_name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
