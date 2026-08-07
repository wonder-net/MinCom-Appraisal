/**
 * useScoreDistribution — custom hook for fetching the performance band
 * distribution report. Re-fetches automatically when any filter changes.
 */

import { useState, useEffect, useCallback } from "react";
import { getScoreDistribution } from "@/api/reports";
import type { ScoreDistributionReport } from "@/types";

interface UseScoreDistributionParams {
  cycleId?: string;
  departmentId?: string;
  formType?: "FORM_A" | "FORM_B" | "";
  jobFamily?: string;
}

interface UseScoreDistributionResult {
  data: ScoreDistributionReport | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

export function useScoreDistribution(
  params: UseScoreDistributionParams,
): UseScoreDistributionResult {
  const { cycleId, departmentId, formType, jobFamily } = params;

  const [data, setData] = useState<ScoreDistributionReport | null>(null);
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
      const report = await getScoreDistribution({
        cycleId,
        departmentId,
        formType,
        jobFamily,
      });
      setData(report);
    } catch (_err: unknown) {
      setError(
        "Failed to load score distribution. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [cycleId, departmentId, formType, jobFamily]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, retry: fetchData };
}
