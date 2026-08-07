/**
 * useDashboardReport — custom hook for fetching and managing
 * the reports dashboard data.
 */

import { useState, useEffect, useCallback } from "react";
import { getDashboardReport } from "@/api/reports";
import type { DashboardReport } from "@/types";

interface UseDashboardReportResult {
  data: DashboardReport | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

export function useDashboardReport(
  cycleId?: string,
): UseDashboardReportResult {
  const [data, setData] = useState<DashboardReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const report = await getDashboardReport(cycleId);
      setData(report);
    } catch (_err: unknown) {
      const message =
        _err instanceof Error
          ? _err.message
          : "Failed to load dashboard data. Please try again.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, retry: fetchData };
}
