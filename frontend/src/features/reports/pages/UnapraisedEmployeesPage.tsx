/**
 * UnapraisedEmployeesPage — thin route wrapper that renders the
 * UnapraisedEmployeesSection with the cycle ID from ReportsCycleContext.
 */

import { useReportsCycle } from "@/features/reports";
import { UnapraisedEmployeesSection } from "../components/UnapraisedEmployeesSection";

export function UnapraisedEmployeesPage() {
  const { cycleId } = useReportsCycle();

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Unapprised Employees
      </h2>
      <UnapraisedEmployeesSection cycleId={cycleId ?? undefined} />
    </div>
  );
}
