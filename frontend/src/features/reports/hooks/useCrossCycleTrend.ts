/**
 * useCrossCycleTrend — custom hook for fetching the cross-cycle
 * trend report. Re-fetches automatically when departmentId changes.
 * Does not require a cycleId — the trend endpoint spans all
 * CLOSED/ARCHIVED cycles.
 */

import { useState, useEffect, useCallback } from "react";
import { getCrossCycleTrend } from "@/api/reports";
import type { CrossCycleTrendReport } from "@/api/reports";

interface UseCrossCycleTrendResult {
  data: CrossCycleTrendReport | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

export function useCrossCycleTrend(
  departmentId?: string,
): UseCrossCycleTrendResult {
  const [data, setData] = useState<CrossCycleTrendReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const report = await getCrossCycleTrend(departmentId);
      setData(report);
    } catch (_err: unknown) {
      setError(
        "Failed to load cross-cycle trend data. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, retry: fetchData };
}
