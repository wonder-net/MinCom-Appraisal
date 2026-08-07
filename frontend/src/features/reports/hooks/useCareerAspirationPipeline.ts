/**
 * useCareerAspirationPipeline — custom hook for fetching career
 * aspiration pipeline report data.
 */

import { useState, useEffect, useCallback } from "react";
import { getCareerAspirationPipeline } from "@/api/reports";
import type { CareerAspirationPipelineReport } from "@/api/reports";

interface UseCareerAspirationPipelineResult {
  data: CareerAspirationPipelineReport | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

export function useCareerAspirationPipeline(
  cycleId?: string,
): UseCareerAspirationPipelineResult {
  const [data, setData] = useState<CareerAspirationPipelineReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const report = await getCareerAspirationPipeline(cycleId);
      setData(report);
    } catch (_err: unknown) {
      setError("Failed to load career aspiration data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, retry: fetchData };
}
