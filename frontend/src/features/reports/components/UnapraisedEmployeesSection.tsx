/**
 * UnapraisedEmployeesSection — Displays employees with no appraisal
 * in the selected cycle, with an optional department filter.
 */

import { useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { UserX } from "lucide-react";
import { useUnapraisedReport } from "../hooks/useUnapraisedReport";
import { useDepartments } from "../hooks/useDepartments";
import type { UnapraisedEmployee } from "@/api/reports";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UnapraisedSkeleton() {
  return (
    <div
      className="animate-pulse space-y-3 p-6"
      aria-busy="true"
      aria-label="Loading unapprised employees"
    >
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

interface EmployeesTableProps {
  employees: UnapraisedEmployee[];
}

function EmployeesTable({ employees }: EmployeesTableProps) {
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full text-sm"
        aria-label="Unapprised employees table"
      >
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left">
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900">
              Employee No.
            </th>
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900">
              Name
            </th>
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900">
              Department
            </th>
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900">
              Job Title
            </th>
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900">
              Manager
            </th>
          </tr>
        </thead>
        <tbody>
          {employees.map((emp, i) => (
            <tr
              key={emp.employee_id}
              className={`border-b border-gray-200 last:border-0 ${
                i % 2 === 1 ? "bg-gray-50" : "bg-white"
              }`}
            >
              <td className="px-6 py-3 text-gray-900 font-medium">
                {emp.employee_number}
              </td>
              <td className="px-6 py-3 text-gray-900">{emp.name}</td>
              <td className="px-6 py-3 text-gray-500">
                {emp.department_name}
              </td>
              <td className="px-6 py-3 text-gray-500">{emp.job_title}</td>
              <td className="px-6 py-3 text-gray-500">{emp.manager_name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface UnapraisedEmployeesSectionProps {
  cycleId?: string;
}

export function UnapraisedEmployeesSection({
  cycleId,
}: UnapraisedEmployeesSectionProps) {
  const [departmentId, setDepartmentId] = useState<string | undefined>(
    undefined,
  );
  const { data, isLoading, error, retry } = useUnapraisedReport(
    cycleId,
    departmentId,
  );
  const { departments } = useDepartments();

  const handleDepartmentChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      setDepartmentId(value === "" ? undefined : value);
    },
    [],
  );

  if (!cycleId) {
    return null;
  }

  const isEmpty = data !== null && data.employees.length === 0;

  return (
    <section aria-label="Unapprised employees">
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <UserX
                className="h-5 w-5 text-secondary"
                aria-hidden="true"
              />
              Unapprised Employees
              {data !== null && (
                <Badge variant="secondary" aria-label={`${data.count} unapprised employees`}>
                  {data.count}
                </Badge>
              )}
            </CardTitle>
            <div className="w-full sm:w-56">
              <label htmlFor="dept-filter" className="sr-only">
                Filter by department
              </label>
              <Select
                id="dept-filter"
                data-testid="department-filter"
                value={departmentId ?? ""}
                onChange={handleDepartmentChange}
                aria-label="Filter by department"
              >
                <option value="">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Error state */}
          {error && (
            <div
              className="m-6 rounded-md border border-red-200 bg-red-50 px-6 py-4"
              role="alert"
            >
              <p className="text-sm text-red-800">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={retry}
              >
                Retry
              </Button>
            </div>
          )}

          {/* Loading state */}
          {isLoading && <UnapraisedSkeleton />}

          {/* Empty state */}
          {!isLoading && !error && isEmpty && (
            <div
              className="flex flex-col items-center justify-center py-16 text-center"
              aria-live="polite"
            >
              <UserX
                className="h-12 w-12 text-gray-400 mb-3"
                aria-hidden="true"
              />
              <p className="text-base font-medium text-gray-500">
                All active employees have an appraisal for this cycle.
              </p>
            </div>
          )}

          {/* Table */}
          {!isLoading && !error && data && data.employees.length > 0 && (
            <EmployeesTable employees={data.employees} />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
