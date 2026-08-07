/**
 * useManagerEffectiveness — custom hook for fetching the manager effectiveness
 * report. Re-fetches automatically when cycleId or departmentId changes.
 * Guards against undefined cycleId (returns null data immediately).
 */

import { useState, useEffect, useCallback } from "react";
import { getManagerEffectiveness } from "@/api/reports";
import type { ManagerEffectivenessReport } from "@/api/reports";

interface UseManagerEffectivenessParams {
  cycleId?: string;
  departmentId?: string;
}

interface UseManagerEffectivenessResult {
  data: ManagerEffectivenessReport | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

export function useManagerEffectiveness(
  params: UseManagerEffectivenessParams,
): UseManagerEffectivenessResult {
  const { cycleId, departmentId } = params;

  const [data, setData] = useState<ManagerEffectivenessReport | null>(null);
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
      const report = await getManagerEffectiveness(cycleId, departmentId);
      setData(report);
    } catch (_err: unknown) {
      setError(
        "Failed to load manager effectiveness data. Please try again.",
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
