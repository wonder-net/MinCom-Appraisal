/**
 * useSelfVsManagerVariance — custom hook for fetching the self vs manager
 * rating variance report. Re-fetches automatically when cycleId or
 * departmentId changes. Guards against undefined cycleId.
 */

import { useState, useEffect, useCallback } from "react";
import { getSelfVsManagerVariance } from "@/api/reports";
import type { SelfVsManagerVarianceReport } from "@/api/reports";

interface UseSelfVsManagerVarianceParams {
  cycleId?: string;
  departmentId?: string;
}

interface UseSelfVsManagerVarianceResult {
  data: SelfVsManagerVarianceReport | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

export function useSelfVsManagerVariance(
  params: UseSelfVsManagerVarianceParams,
): UseSelfVsManagerVarianceResult {
  const { cycleId, departmentId } = params;

  const [data, setData] = useState<SelfVsManagerVarianceReport | null>(null);
  const [isLoading, setIsLoading] = useState(!!cycleId);
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
      const report = await getSelfVsManagerVariance(cycleId, departmentId);
      setData(report);
    } catch (_err: unknown) {
      setError(
        "Failed to load rating variance data. Please try again.",
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
