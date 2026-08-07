/**
 * NineBoxPage — thin route wrapper that renders the NineBoxGrid with
 * the cycle ID from ReportsCycleContext.
 */

import { useReportsCycle } from "@/features/reports";
import { NineBoxGrid } from "../components/NineBoxGrid";

export function NineBoxPage() {
  const { cycleId } = useReportsCycle();

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        9-Box Talent Grid
      </h2>
      <NineBoxGrid cycleId={cycleId ?? undefined} />
    </div>
  );
}
