/**
 * useBSCPerspectives — custom hook for fetching the BSC perspective
 * breakdown report. Re-fetches automatically when cycleId or
 * departmentId changes. Guards against undefined cycleId.
 */

import { useState, useEffect, useCallback } from "react";
import { getBSCPerspectives } from "@/api/reports";
import type { BSCPerspectiveReport } from "@/api/reports";

interface UseBSCPerspectivesParams {
  cycleId?: string;
  departmentId?: string;
}

interface UseBSCPerspectivesResult {
  data: BSCPerspectiveReport | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

export function useBSCPerspectives(
  params: UseBSCPerspectivesParams,
): UseBSCPerspectivesResult {
  const { cycleId, departmentId } = params;

  const [data, setData] = useState<BSCPerspectiveReport | null>(null);
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
      const report = await getBSCPerspectives({
        cycleId,
        departmentId,
      });
      setData(report);
    } catch (_err: unknown) {
      setError(
        "Failed to load BSC perspective breakdown. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [cycleId, departmentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, retry: fetchData };
}
