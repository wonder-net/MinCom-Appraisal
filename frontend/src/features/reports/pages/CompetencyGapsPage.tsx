/**
 * CompetencyGapsPage — thin route wrapper that renders the
 * CompetencyGapSection with the cycle ID from ReportsCycleContext.
 */

import { useReportsCycle } from "@/features/reports";
import { CompetencyGapSection } from "../components/CompetencyGapSection";

export function CompetencyGapsPage() {
  const { cycleId } = useReportsCycle();

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Competency Gaps
      </h2>
      <CompetencyGapSection cycleId={cycleId ?? undefined} />
    </div>
  );
}
