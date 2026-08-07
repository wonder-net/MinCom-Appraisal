/**
 * ManagerEffectivenessPage — thin route wrapper that renders the
 * ManagerEffectivenessSection with the cycle ID from ReportsCycleContext.
 */

import { useReportsCycle } from "@/features/reports";
import { ManagerEffectivenessSection } from "../components/ManagerEffectivenessSection";

export function ManagerEffectivenessPage() {
  const { cycleId } = useReportsCycle();

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Manager Effectiveness
      </h2>
      <ManagerEffectivenessSection cycleId={cycleId ?? undefined} />
    </div>
  );
}
