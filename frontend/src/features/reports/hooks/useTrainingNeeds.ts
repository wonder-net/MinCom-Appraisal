/**
 * useTrainingNeeds — custom hook for fetching training needs report data.
 */

import { useState, useEffect, useCallback } from "react";
import { getTrainingNeeds } from "@/api/reports";
import type { TrainingNeedsReport } from "@/api/reports";

interface UseTrainingNeedsResult {
  data: TrainingNeedsReport | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

export function useTrainingNeeds(
  cycleId?: string,
): UseTrainingNeedsResult {
  const [data, setData] = useState<TrainingNeedsReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const report = await getTrainingNeeds(cycleId);
      setData(report);
    } catch (_err: unknown) {
      setError("Failed to load training needs. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, retry: fetchData };
}
