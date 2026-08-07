/**
 * DisputeLogPage — thin route wrapper that renders the
 * DisputeLogSection with the cycle ID from ReportsCycleContext.
 */

import { useReportsCycle } from "@/features/reports";
import { DisputeLogSection } from "../components/DisputeLogSection";

export function DisputeLogPage() {
  const { cycleId } = useReportsCycle();

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Dispute Log
      </h2>
      <DisputeLogSection cycleId={cycleId ?? undefined} />
    </div>
  );
}
