/**
 * useDisputeLog — custom hook for fetching the dispute and rejection log.
 * Re-fetches automatically when cycleId changes.
 */

import { useState, useEffect, useCallback } from "react";
import { getDisputeLog } from "@/api/reports";
import type { DisputeLogReport } from "@/api/reports";

interface UseDisputeLogResult {
  data: DisputeLogReport | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

export function useDisputeLog(cycleId?: string): UseDisputeLogResult {
  const [data, setData] = useState<DisputeLogReport | null>(null);
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
      const report = await getDisputeLog(cycleId);
      setData(report);
    } catch (_err: unknown) {
      setError("Failed to load dispute log. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, retry: fetchData };
}
