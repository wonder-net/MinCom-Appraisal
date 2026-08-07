/**
 * ScoreDistributionPage — thin route wrapper that renders the
 * ScoreDistributionSection with the cycle ID from ReportsCycleContext.
 */

import { useReportsCycle } from "@/features/reports";
import { ScoreDistributionSection } from "../components/ScoreDistributionSection";

export function ScoreDistributionPage() {
  const { cycleId } = useReportsCycle();

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Performance Distribution
      </h2>
      <ScoreDistributionSection cycleId={cycleId ?? undefined} />
    </div>
  );
}
