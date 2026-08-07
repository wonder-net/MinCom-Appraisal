/**
 * useNineBox — custom hook for fetching the 9-box talent grid report.
 * Re-fetches automatically when cycleId changes. Handles 403 errors
 * inline by returning a dedicated `isForbidden` flag.
 */

import { useState, useEffect, useCallback } from "react";
import { isAxiosError } from "axios";
import { getNineBox } from "@/api/reports";
import type { NineBoxReport } from "@/api/reports";

interface UseNineBoxResult {
  data: NineBoxReport | null;
  isLoading: boolean;
  error: string | null;
  isForbidden: boolean;
  retry: () => void;
}

export function useNineBox(cycleId?: string): UseNineBoxResult {
  const [data, setData] = useState<NineBoxReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);

  const fetchData = useCallback(async () => {
    if (!cycleId) {
      setData(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    setIsForbidden(false);

    try {
      const report = await getNineBox(cycleId);
      setData(report);
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response?.status === 403) {
        setIsForbidden(true);
      } else {
        setError("Failed to load 9-box talent grid. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, isForbidden, retry: fetchData };
}
