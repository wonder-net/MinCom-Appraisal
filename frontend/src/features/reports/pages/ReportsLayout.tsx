/**
 * ReportsLayout — shared layout for all /reports/* pages.
 *
 * Owns the cycle selector (persisted in URL via ?cycle=<id>) and a
 * horizontal sub-nav tab bar. Provides the resolved cycle ID to
 * child pages via ReportsCycleContext.
 */

import { useMemo, useCallback } from "react";
import { Outlet, Link, useSearchParams, useMatch } from "react-router-dom";
import { Select } from "@/components/ui/select";
import { DashboardSkeleton } from "../components/DashboardSkeleton";
import { useCycles } from "@/features/appraisals/hooks/useCycles";
import { useAuth } from "@/auth/useAuth";
import { ReportsCycleContext } from "../context/ReportsCycleContext";
import type { UserRole } from "@/auth/types";
import type { AppraisalCycle } from "@/types";

// ---------------------------------------------------------------------------
// Sub-nav configuration
// ---------------------------------------------------------------------------

interface NavTab {
  label: string;
  to: string;
  roles: UserRole[];
  end: boolean;
}

const NAV_TABS: readonly NavTab[] = [
  { label: "Dashboard", to: "/reports", roles: ["HR_ADMIN", "EXECUTIVE"], end: true },
  { label: "Unapprised Employees", to: "/reports/unapprised", roles: ["HR_ADMIN"], end: false },
  { label: "Performance Distribution", to: "/reports/score-distribution", roles: ["HR_ADMIN", "EXECUTIVE"], end: false },
  { label: "Competency Gaps", to: "/reports/competency-gaps", roles: ["HR_ADMIN"], end: false },
  { label: "Manager Effectiveness", to: "/reports/manager-effectiveness", roles: ["HR_ADMIN", "EXECUTIVE"], end: false },
  { label: "Dispute Log", to: "/reports/disputes", roles: ["HR_ADMIN"], end: false },
  { label: "BSC Perspectives", to: "/reports/bsc-perspectives", roles: ["HR_ADMIN", "EXECUTIVE"], end: false },
  { label: "Identified Training Needs", to: "/reports/training-needs", roles: ["HR_ADMIN"], end: false },
  { label: "Career Pipeline", to: "/reports/career-pipeline", roles: ["HR_ADMIN", "EXECUTIVE"], end: false },
  { label: "Audit Compliance", to: "/reports/audit-compliance", roles: ["HR_ADMIN"], end: false },
  // { label: "Descriptor Config", to: "/reports/descriptor-config", roles: ["HR_ADMIN"], end: false },
  { label: "Trend", to: "/reports/trend", roles: ["HR_ADMIN", "EXECUTIVE"], end: false },
  { label: "Rating Variance", to: "/reports/variance", roles: ["HR_ADMIN", "EXECUTIVE"], end: false },
] as const;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Derive the default cycle ID: first ACTIVE cycle, or the first cycle
 * in the list if none are active (list is ordered by -start_date).
 */
function deriveDefaultCycleId(cycles: AppraisalCycle[]): string | null {
  const active = cycles.find((c) => c.status === "ACTIVE");
  if (active) return active.id;
  return cycles.length > 0 ? cycles[0].id : null;
}

/**
 * Format cycle label for the selector dropdown.
 */
function formatCycleLabel(cycle: AppraisalCycle): string {
  return `${cycle.period_name} (${cycle.status})`;
}

/**
 * Filter nav tabs to those the user has access to.
 */
function filterTabsByRoles(
  tabs: readonly NavTab[],
  userRoles: UserRole[],
): NavTab[] {
  return tabs.filter((tab) =>
    tab.roles.some((role) => userRoles.includes(role)),
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SubNavTab({ tab }: { tab: NavTab }) {
  const match = useMatch(tab.end ? { path: tab.to, end: true } : tab.to);
  const [searchParams] = useSearchParams();
  const isActive = match !== null;

  return (
    <Link
      to={{ pathname: tab.to, search: searchParams.toString() }}
      aria-current={isActive ? "page" : undefined}
      className={
        isActive
          ? "border-b-2 border-secondary text-secondary font-medium px-3 py-2 text-sm whitespace-nowrap"
          : "text-gray-500 hover:text-gray-700 px-3 py-2 text-sm whitespace-nowrap"
      }
    >
      {tab.label}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main layout
// ---------------------------------------------------------------------------

export function ReportsLayout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { cycles, isLoading: cyclesLoading, isFetching: _cyclesFetching } = useCycles();
  const { user } = useAuth();

  const userRoles = useMemo(
    () => user?.roles ?? [],
    [user?.roles],
  );

  const visibleTabs = useMemo(
    () => filterTabsByRoles(NAV_TABS, userRoles),
    [userRoles],
  );

  const defaultCycleId = useMemo(
    () => deriveDefaultCycleId(cycles),
    [cycles],
  );

  // URL param takes priority, then computed default.
  const cycleParam = searchParams.get("cycle");
  const resolvedCycleId = cycleParam ?? defaultCycleId;

  const handleCycleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newCycleId = e.target.value;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("cycle", newCycleId);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const contextValue = useMemo(
    () => ({ cycleId: resolvedCycleId }),
    [resolvedCycleId],
  );

  return (
    <div aria-label="Reports section">
      {/* Page header: title + cycle selector */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
        <div className="w-full sm:w-64">
          <label htmlFor="cycle-selector" className="sr-only">
            Select appraisal cycle
          </label>
          {cyclesLoading ? (
            <Select
              id="cycle-selector"
              data-testid="cycle-selector"
              disabled
              aria-label="Select appraisal cycle"
              value=""
              placeholder="Loading cycles..."
            />
          ) : (
            <Select
              id="cycle-selector"
              data-testid="cycle-selector"
              value={resolvedCycleId ?? ""}
              onChange={handleCycleChange}
              aria-label="Select appraisal cycle"
              placeholder="Select cycle..."
            >
              {cycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  {formatCycleLabel(cycle)}
                </option>
              ))}
            </Select>
          )}
        </div>
      </div>

      {/* Loading skeleton while cycles load */}
      {cyclesLoading && <DashboardSkeleton />}

      {/* Horizontal sub-nav tab bar */}
      {!cyclesLoading && (
        <>
          <nav
            aria-label="Report pages"
            className="mb-6 border-b border-gray-200 overflow-x-auto"
          >
            <div className="flex gap-1 -mb-px">
              {visibleTabs.map((tab) => (
                <SubNavTab key={tab.to} tab={tab} />
              ))}
            </div>
          </nav>

          <ReportsCycleContext.Provider value={contextValue}>
            <Outlet />
          </ReportsCycleContext.Provider>
        </>
      )}
    </div>
  );
}
