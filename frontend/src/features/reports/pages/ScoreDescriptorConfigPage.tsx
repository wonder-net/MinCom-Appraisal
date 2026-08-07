/**
 * ScoreDescriptorConfigPage — thin route wrapper that renders the
 * ScoreDescriptorConfigSection with the cycle ID from ReportsCycleContext.
 */

import { useReportsCycle } from "@/features/reports";
import { ScoreDescriptorConfigSection } from "../components/ScoreDescriptorConfigSection";

export function ScoreDescriptorConfigPage() {
  const { cycleId } = useReportsCycle();

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Score Descriptor Configuration
      </h2>
      <ScoreDescriptorConfigSection cycleId={cycleId ?? undefined} />
    </div>
  );
}
