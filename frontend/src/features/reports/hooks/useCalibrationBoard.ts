/**
 * useCalibrationBoard — custom hook for fetching (and acting on) the
 * calibration board for one department in a cycle. Re-fetches
 * automatically when cycleId/departmentId change. Handles 403 errors
 * inline by returning a dedicated `isForbidden` flag.
 */

import { useState, useEffect, useCallback } from "react";
import { isAxiosError } from "axios";
import { getCalibrationBoard, completeCalibration, reopenCalibration } from "@/api/calibration";
import type { CalibrationBoard } from "@/api/calibration";

interface UseCalibrationBoardResult {
  data: CalibrationBoard | null;
  isLoading: boolean;
  error: string | null;
  isForbidden: boolean;
  isSubmitting: boolean;
  actionError: string | null;
  retry: () => void;
  complete: (notes?: string) => Promise<boolean>;
  reopen: () => Promise<boolean>;
}

export function useCalibrationBoard(cycleId?: string, departmentId?: string): UseCalibrationBoardResult {
  const [data, setData] = useState<CalibrationBoard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!cycleId || !departmentId) {
      setData(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    setIsForbidden(false);

    try {
      const board = await getCalibrationBoard(cycleId, departmentId);
      setData(board);
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response?.status === 403) {
        setIsForbidden(true);
      } else {
        setError("Failed to load calibration board. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [cycleId, departmentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const complete = useCallback(
    async (notes?: string): Promise<boolean> => {
      if (!cycleId || !departmentId) return false;
      setIsSubmitting(true);
      setActionError(null);
      try {
        const board = await completeCalibration(cycleId, departmentId, notes);
        setData(board);
        return true;
      } catch {
        setActionError("Failed to complete calibration. Please try again.");
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [cycleId, departmentId],
  );

  const reopen = useCallback(async (): Promise<boolean> => {
    if (!cycleId || !departmentId) return false;
    setIsSubmitting(true);
    setActionError(null);
    try {
      const board = await reopenCalibration(cycleId, departmentId);
      setData(board);
      return true;
    } catch {
      setActionError("Failed to reopen calibration. Please try again.");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [cycleId, departmentId]);

  return { data, isLoading, error, isForbidden, isSubmitting, actionError, retry: fetchData, complete, reopen };
}
