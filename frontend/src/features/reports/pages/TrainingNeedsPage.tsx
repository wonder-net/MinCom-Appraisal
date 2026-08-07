/**
 * TrainingNeedsPage — thin route wrapper that renders the
 * TrainingNeedsSection with the cycle ID from ReportsCycleContext.
 */

import { useReportsCycle } from "@/features/reports";
import { TrainingNeedsSection } from "../components/TrainingNeedsSection";

export function TrainingNeedsPage() {
  const { cycleId } = useReportsCycle();

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Identified Training Needs
      </h2>
      <TrainingNeedsSection cycleId={cycleId ?? undefined} />
    </div>
  );
}
