/**
 * useDepartmentReport — custom hook for fetching a single department's
 * detailed report. Refetches when deptId changes. Does nothing when
 * deptId is null.
 */

import { useState, useEffect, useCallback } from "react";
import { getDepartmentReport } from "@/api/reports";
import { extractApiError } from "@/utils/extract-api-error";
import type { DepartmentReport } from "@/types";

interface UseDepartmentReportResult {
  data: DepartmentReport | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

export function useDepartmentReport(
  deptId: string | null,
  cycleId?: string,
): UseDepartmentReportResult {
  const [data, setData] = useState<DepartmentReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const report = await getDepartmentReport(id, cycleId);
      setData(report);
    } catch (err: unknown) {
      setError(extractApiError(err));
    } finally {
      setIsLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    if (!deptId) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    fetchData(deptId);
  }, [deptId, cycleId, fetchData]);

  const retry = useCallback(() => {
    if (deptId) {
      fetchData(deptId);
    }
  }, [deptId, fetchData]);

  return { data, isLoading, error, retry };
}
