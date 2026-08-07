/**
 * useCompetencyGaps — custom hook for fetching the competency gap
 * report. Re-fetches automatically when cycleId or formType changes.
 * Guards against undefined cycleId.
 */

import { useState, useEffect, useCallback } from "react";
import { getCompetencyGaps } from "@/api/reports";
import type { CompetencyGapReport } from "@/api/reports";

interface UseCompetencyGapsParams {
  cycleId?: string;
  formType?: "FORM_A" | "FORM_B";
}

interface UseCompetencyGapsResult {
  data: CompetencyGapReport | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

export function useCompetencyGaps(
  params: UseCompetencyGapsParams,
): UseCompetencyGapsResult {
  const { cycleId, formType } = params;

  const [data, setData] = useState<CompetencyGapReport | null>(null);
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
      const report = await getCompetencyGaps(cycleId, formType);
      setData(report);
    } catch (_err: unknown) {
      setError(
        "Failed to load competency gap report. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [cycleId, formType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, retry: fetchData };
}
