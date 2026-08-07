/**
 * CareerAspirationPipelinePage — thin route wrapper that renders the
 * CareerAspirationPipelineSection with the cycle ID from ReportsCycleContext.
 */

import { useReportsCycle } from "@/features/reports";
import { CareerAspirationPipelineSection } from "../components/CareerAspirationPipelineSection";

export function CareerAspirationPipelinePage() {
  const { cycleId } = useReportsCycle();

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Career Aspiration Pipeline
      </h2>
      <CareerAspirationPipelineSection cycleId={cycleId ?? undefined} />
    </div>
  );
}
