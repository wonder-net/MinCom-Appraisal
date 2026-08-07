/**
 * AuditCompliancePage — thin route wrapper that renders the
 * AuditComplianceSection with the cycle ID from ReportsCycleContext.
 */

import { useReportsCycle } from "@/features/reports";
import { AuditComplianceSection } from "../components/AuditComplianceSection";

export function AuditCompliancePage() {
  const { cycleId } = useReportsCycle();

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Audit Compliance
      </h2>
      <AuditComplianceSection cycleId={cycleId ?? undefined} />
    </div>
  );
}
