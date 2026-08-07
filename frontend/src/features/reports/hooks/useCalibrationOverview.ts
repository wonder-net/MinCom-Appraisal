/**
 * useCalibrationOverview — custom hook for fetching the calibration
 * overview (one row per department with calibration-ready appraisals).
 * Re-fetches automatically when cycleId changes. Handles 403 errors
 * inline by returning a dedicated `isForbidden` flag.
 */

import { useState, useEffect, useCallback } from "react";
import { isAxiosError } from "axios";
import { getCalibrationOverview } from "@/api/calibration";
import type { CalibrationOverview } from "@/api/calibration";

interface UseCalibrationOverviewResult {
  data: CalibrationOverview | null;
  isLoading: boolean;
  error: string | null;
  isForbidden: boolean;
  retry: () => void;
}

export function useCalibrationOverview(cycleId?: string): UseCalibrationOverviewResult {
  const [data, setData] = useState<CalibrationOverview | null>(null);
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
      const overview = await getCalibrationOverview(cycleId);
      setData(overview);
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response?.status === 403) {
        setIsForbidden(true);
      } else {
        setError("Failed to load calibration overview. Please try again.");
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
