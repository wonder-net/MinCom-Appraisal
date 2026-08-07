/**
 * useDepartments — custom hook for fetching the departments list
 * for filter dropdowns in the reports feature.
 */

import { useState, useEffect, useCallback } from "react";
import { listDepartments } from "@/api/employees";
import type { DepartmentLookup } from "@/api/employees";

interface UseDepartmentsResult {
  departments: DepartmentLookup[];
  isLoading: boolean;
  error: string | null;
}

export function useDepartments(): UseDepartmentsResult {
  const [departments, setDepartments] = useState<DepartmentLookup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await listDepartments();
      setDepartments(result);
    } catch (_err: unknown) {
      setError("Failed to load departments.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { departments, isLoading, error };
}
