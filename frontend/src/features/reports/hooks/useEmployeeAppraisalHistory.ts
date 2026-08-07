/**
 * useEmployeeAppraisalHistory — custom hook for fetching appraisal
 * history for a specific employee. Handles 403 errors inline by
 * returning a dedicated `isForbidden` flag.
 */

import { useState, useEffect, useCallback } from "react";
import { isAxiosError } from "axios";
import { getEmployeeAppraisalHistory } from "@/api/reports";
import type { EmployeeAppraisalHistory } from "@/api/reports";

interface UseEmployeeAppraisalHistoryResult {
  data: EmployeeAppraisalHistory | null;
  isLoading: boolean;
  error: string | null;
  isForbidden: boolean;
  retry: () => void;
}

export function useEmployeeAppraisalHistory(
  employeeId: string,
): UseEmployeeAppraisalHistoryResult {
  const [data, setData] = useState<EmployeeAppraisalHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);

  const fetchData = useCallback(async () => {
    if (!employeeId) {
      setData(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setIsForbidden(false);

    try {
      const result = await getEmployeeAppraisalHistory(employeeId);
      setData(result);
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response?.status === 403) {
        setIsForbidden(true);
      } else {
        setError("Failed to load appraisal history. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, isForbidden, retry: fetchData };
}
