/**
 * useEmployeeProfile — custom hook for fetching employee profile
 * and optionally their direct reports.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { getEmployee, getDirectReports } from "@/api/employees";
import type { Employee } from "@/api/employees";
import { useAuth } from "@/auth/useAuth";
import { isAdminUser } from "@/auth/role-helpers";
import { isAxiosError } from "axios";

interface UseEmployeeProfileResult {
  employee: Employee | null;
  directReports: Employee[];
  isLoading: boolean;
  isNotFound: boolean;
  error: string | null;
  canSeeDirectReports: boolean;
  retry: () => void;
}

export function useEmployeeProfile(id: string): UseEmployeeProfileResult {
  const { user } = useAuth();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [directReports, setDirectReports] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isNotFound, setIsNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showDirectReports, setShowDirectReports] = useState(false);

  // Determine upfront if this user should see direct reports for this employee
  const mayFetchDirectReports = useMemo(() => {
    if (!user) return false;
    // Admin-tier (HR_ADMIN / SYSTEM_ADMIN — TASK-303) and Executive can view
    // anyone's direct reports.
    if (isAdminUser(user) || user.roles.includes("EXECUTIVE")) return true;
    // Managers can only view their OWN direct reports
    if (user.roles.includes("MANAGER") && user.employee_id === id) return true;
    return false;
  }, [user, id]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setIsNotFound(false);
    setShowDirectReports(false);
    setDirectReports([]);

    try {
      const emp = await getEmployee(id);
      setEmployee(emp);

      // Only attempt direct-reports for qualifying roles
      if (mayFetchDirectReports) {
        try {
          const reports = await getDirectReports(id);
          setDirectReports(reports);
          setShowDirectReports(true);
        } catch {
          // Non-fatal — profile is already loaded. Silently hide direct reports.
          setShowDirectReports(false);
        }
      }
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response?.status === 404) {
        setIsNotFound(true);
      } else {
        setError("Failed to load employee profile. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [id, mayFetchDirectReports]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    employee,
    directReports,
    isLoading,
    isNotFound,
    error,
    canSeeDirectReports: showDirectReports,
    retry: fetchData,
  };
}
