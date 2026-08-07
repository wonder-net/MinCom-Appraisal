/**
 * useEmployeeLookups — Fetches department, location, and job family lookups.
 *
 * Returns the loaded lists, loading/error flags, and a `refetch` function.
 * Called inside AddUserDialog and EditUserDialog so that individual field
 * components do not each trigger their own fetch.
 *
 * The `refetch` function allows callers to refresh lookups on demand
 * (e.g. when a dialog opens) so that newly auto-created departments
 * appear in the dropdown without a full page reload.
 */

import { useState, useEffect, useCallback } from "react";
import {
  listDepartments,
  listJobFamilies,
  listLocations,
  type DepartmentLookup,
} from "@/api/employees";

export interface EmployeeLookupsResult {
  departments: DepartmentLookup[];
  locations: string[];
  jobFamilies: string[];
  isLoading: boolean;
  isError: boolean;
  /** Re-fetch all lookups. Useful when dialog opens to pick up newly created entries. */
  refetch: () => void;
}

export function useEmployeeLookups(): EmployeeLookupsResult {
  const [departments, setDepartments] = useState<DepartmentLookup[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [jobFamilies, setJobFamilies] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [fetchCount, setFetchCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchLookups(): Promise<void> {
      setIsLoading(true);
      setIsError(false);
      try {
        const [depts, locs, jfs] = await Promise.all([
          listDepartments(),
          listLocations(),
          listJobFamilies(),
        ]);
        if (!cancelled) {
          setDepartments(depts);
          setLocations(locs);
          setJobFamilies(jfs);
        }
      } catch {
        if (!cancelled) {
          setDepartments([]);
          setLocations([]);
          setJobFamilies([]);
          setIsError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchLookups();
    return () => {
      cancelled = true;
    };
  }, [fetchCount]);

  const refetch = useCallback(() => {
    setFetchCount((prev) => prev + 1);
  }, []);

  return { departments, locations, jobFamilies, isLoading, isError, refetch };
}
