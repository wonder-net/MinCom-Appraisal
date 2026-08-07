/**
 * CrossCycleTrendPage — thin route wrapper that renders the
 * CrossCycleTrendSection. Reads optional ?dept=<uuid> from URL
 * search params to pre-select a department filter.
 *
 * The cycle selector in ReportsLayout is inherited but effectively
 * inert on this page — the trend endpoint spans all cycles.
 */

import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { CrossCycleTrendSection } from "../components/CrossCycleTrendSection";

export function CrossCycleTrendPage() {
  const [searchParams] = useSearchParams();

  const departmentId = useMemo(
    () => searchParams.get("dept") ?? undefined,
    [searchParams],
  );

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Cross-Cycle Trend
      </h2>
      <CrossCycleTrendSection departmentId={departmentId} />
    </div>
  );
}
