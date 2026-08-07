/**
 * ReportsCycleContext — provides the selected appraisal cycle ID
 * to all report sub-pages via React context.
 *
 * The context value is set exclusively by ReportsLayout. Child pages
 * consume it via the useReportsCycle() hook.
 */

import { createContext, useContext } from "react";

interface ReportsCycleContextValue {
  cycleId: string | null;
}

const ReportsCycleContext = createContext<ReportsCycleContextValue | null>(null);

/**
 * Consume the selected cycle ID from the ReportsLayout provider.
 * Throws if called outside the provider tree.
 */
export function useReportsCycle(): ReportsCycleContextValue {
  const context = useContext(ReportsCycleContext);

  if (context === null) {
    throw new Error(
      "useReportsCycle must be used within a <ReportsLayout>. " +
        "Ensure this component is rendered as a child of the /reports route.",
    );
  }

  return context;
}

export { ReportsCycleContext };
export type { ReportsCycleContextValue };
