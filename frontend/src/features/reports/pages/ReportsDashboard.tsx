/**
 * ReportsDashboard — HR Admin / Executive reports dashboard page.
 *
 * Displays summary stat cards, status breakdown, department table,
 * department drill-down panel, and CSV export. The cycle selector
 * lives in ReportsLayout; this page reads cycleId from context.
 *
 * Section-specific reports (training needs, unapprised employees,
 * score distribution, etc.) have been extracted into dedicated
 * route pages under /reports/*.
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatCard } from "../components/StatCard";
import { DashboardSkeleton } from "../components/DashboardSkeleton";
import { NoCycleBanner } from "../components/NoCycleBanner";
import { StatusBreakdownTable } from "../components/StatusBreakdownTable";
import { DepartmentTable } from "../components/DepartmentTable";
import { DepartmentDrillDown } from "../components/DepartmentDrillDown";
import { CSVExportButton } from "../components/CSVExportButton";
import { useDashboardReport } from "../hooks/useDashboardReport";
import { useReportsCycle } from "@/features/reports";

export function ReportsDashboard() {
  const { cycleId: resolvedCycleId } = useReportsCycle();

  const { data, isLoading, error, retry } = useDashboardReport(
    resolvedCycleId ?? undefined,
  );

  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);

  const handleDeptClick = useCallback((id: string) => {
    setSelectedDeptId(id);
  }, []);

  const handleCloseDrillDown = useCallback(() => {
    setSelectedDeptId(null);
  }, []);

  if (isLoading) {
    return (
      <div>
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div aria-label="Reports dashboard">
      <a
        href="#dashboard-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow text-sm"
      >
        Skip to dashboard content
      </a>

      {/* Page heading + CSV export */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Reports Dashboard
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {data?.cycle_name ?? "No active cycle"}
          </p>
        </div>
        <CSVExportButton cycleId={resolvedCycleId ?? undefined} />
      </div>

      {/* Error state */}
      {error && (
        <Alert variant="error" className="mb-6">
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={retry}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div id="dashboard-content" className="space-y-6">
        {/* No-cycle banner */}
        {data && !data.cycle_id && <NoCycleBanner />}

        {/* Summary stat cards */}
        {data && (
          <section aria-label="Summary statistics">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                label="Total Employees"
                value={String(data.total_employees)}
              />
              <StatCard
                label="Completion Rate"
                value={`${Number(data.completion_rate).toFixed(1)}%`}
                sub="Signed Off or Finalised"
                accent={
                  Number(data.completion_rate) >= 70 ? "success" : "warning"
                }
              />
              <StatCard
                label="Overdue"
                value={String(data.overdue_count)}
                sub="Appraisals past deadline"
                accent={data.overdue_count > 0 ? "error" : "success"}
              />
            </div>
          </section>
        )}

        {/* Status breakdown table */}
        {data && (
          <StatusBreakdownTable
            appraisalsByStatus={data.appraisals_by_status}
          />
        )}

        {/* Department breakdown table */}
        {data && (
          <DepartmentTable
            departments={data.departments ?? []}
            onSelectDepartment={handleDeptClick}
          />
        )}
      </div>

      {/* Department drill-down panel */}
      <DepartmentDrillDown
        deptId={selectedDeptId}
        cycleId={resolvedCycleId ?? undefined}
        onClose={handleCloseDrillDown}
      />
    </div>
  );
}
