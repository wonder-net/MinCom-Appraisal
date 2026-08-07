/**
 * BSCPerspectivesPage — thin route wrapper that renders the
 * BSCPerspectiveSection with the cycle ID from ReportsCycleContext.
 */

import { useReportsCycle } from "@/features/reports";
import { BSCPerspectiveSection } from "../components/BSCPerspectiveSection";

export function BSCPerspectivesPage() {
  const { cycleId } = useReportsCycle();

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        BSC Perspectives
      </h2>
      <BSCPerspectiveSection cycleId={cycleId ?? undefined} />
    </div>
  );
}
