/**
 * useUnapraisedReport — custom hook for fetching unapprised employees report data.
 * Re-fetches automatically when cycleId or departmentId changes.
 */

import { useState, useEffect, useCallback } from "react";
import { getUnapraisedReport } from "@/api/reports";
import type { UnapraisedReport } from "@/api/reports";

interface UseUnapraisedReportResult {
  data: UnapraisedReport | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

export function useUnapraisedReport(
  cycleId?: string,
  departmentId?: string,
): UseUnapraisedReportResult {
  const [data, setData] = useState<UnapraisedReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!cycleId) {
      setData(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const report = await getUnapraisedReport(cycleId, departmentId);
      setData(report);
    } catch (_err: unknown) {
      setError("Failed to load unapprised employees. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [cycleId, departmentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, retry: fetchData };
}
