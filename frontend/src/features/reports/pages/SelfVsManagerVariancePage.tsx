/**
 * SelfVsManagerVariancePage — thin route wrapper that renders the
 * SelfVsManagerVarianceSection with the cycle ID from ReportsCycleContext.
 */

import { useReportsCycle } from "@/features/reports";
import { SelfVsManagerVarianceSection } from "../components/SelfVsManagerVarianceSection";

export function SelfVsManagerVariancePage() {
  const { cycleId } = useReportsCycle();

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Self vs Manager Rating Variance
      </h2>
      <SelfVsManagerVarianceSection cycleId={cycleId ?? undefined} />
    </div>
  );
}
