/**
 * useScoreDescriptorConfig — custom hook for fetching the score descriptor
 * configuration audit report. Skips the fetch when cycleId is undefined.
 * Re-fetches automatically when cycleId changes.
 */

import { useState, useEffect, useCallback } from "react";
import { getScoreDescriptorConfig } from "@/api/reports";
import type { ScoreDescriptorConfigReport } from "@/api/reports";

interface UseScoreDescriptorConfigResult {
  data: ScoreDescriptorConfigReport | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

export function useScoreDescriptorConfig(
  cycleId?: string,
): UseScoreDescriptorConfigResult {
  const [data, setData] = useState<ScoreDescriptorConfigReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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
      const report = await getScoreDescriptorConfig(cycleId);
      setData(report);
    } catch (_err: unknown) {
      setError(
        "Failed to load descriptor configuration. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, retry: fetchData };
}
