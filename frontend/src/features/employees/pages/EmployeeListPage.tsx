/**
 * EmployeeListPage — Searchable, paginated employee directory.
 * Route: /employees (all authenticated users)
 */

import { useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Users2 } from "lucide-react";
import { useEmployeeList } from "../hooks/useEmployeeList";
import type { Employee } from "@/api/employees";

function EmployeeTableSkeleton() {
  return (
    <div className="animate-pulse p-6 space-y-3" aria-busy="true" aria-label="Loading employees">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-10 rounded bg-gray-200" />
      ))}
    </div>
  );
}

interface EmployeeTableProps {
  employees: Employee[];
  onRowClick: (id: string) => void;
}

function EmployeeTable({ employees, onRowClick }: EmployeeTableProps) {
  const handleKeyDown = useCallback(
    (id: string, e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onRowClick(id);
      }
    },
    [onRowClick],
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Employee directory">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-2 text-left font-semibold">Name</th>
            <th className="px-4 py-2 text-left font-semibold">Job Title</th>
            <th className="px-4 py-2 text-left font-semibold">Department</th>
            <th className="px-4 py-2 text-left font-semibold">Location</th>
            <th className="px-4 py-2 text-left font-semibold">Classification</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {employees.map((emp, i) => (
            <tr
              key={emp.id}
              className={`${i % 2 === 1 ? "bg-gray-50" : "bg-white"} hover:bg-blue-50 transition-colors cursor-pointer`}
              tabIndex={0}
              role="button"
              aria-label={`View profile for ${emp.name}`}
              onClick={() => onRowClick(emp.id)}
              onKeyDown={(e) => handleKeyDown(emp.id, e)}
            >
              <td className="px-4 py-3 font-medium text-primary hover:underline">
                <span className="inline-flex items-center gap-2">
                  {emp.photo_url ? (
                    <img
                      src={emp.photo_url}
                      alt=""
                      className="h-6 w-6 rounded-full object-cover border border-gray-200 flex-shrink-0"
                    />
                  ) : null}
                  {emp.name}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-600">{emp.job_title || "\u2014"}</td>
              <td className="px-4 py-3 text-gray-600">{emp.department_full_label ?? emp.department_name}</td>
              <td className="px-4 py-3 text-gray-600">{emp.location || "\u2014"}</td>
              <td className="px-4 py-3 text-gray-600">{emp.classification_display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmployeeListPage() {
  const navigate = useNavigate();
  const {
    employees,
    count,
    page,
    pageSize,
    isLoading,
    isFetching: _isFetching,
    error,
    searchInput,
    debouncedSearch,
    setSearchInput,
    setPage,
    retry,
  } = useEmployeeList();

  const isEmpty = !isLoading && employees.length === 0;
  const totalPages = useMemo(() => Math.ceil(count / pageSize), [count, pageSize]);
  const showingFrom = useMemo(() => (count > 0 ? (page - 1) * pageSize + 1 : 0), [page, pageSize, count]);
  const showingTo = useMemo(() => Math.min(page * pageSize, count), [page, pageSize, count]);
  const hasNextPage = page < totalPages;
  const hasPreviousPage = page > 1;

  const handleRowClick = useCallback(
    (id: string) => {
      void navigate(`/employees/${id}`);
    },
    [navigate],
  );

  return (
    <div aria-label="Employee directory">
      <a
        href="#employee-table"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow text-sm"
      >
        Skip to employee table
      </a>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Employee Directory</h1>
        <p className="text-sm text-gray-500 mt-1">
          Browse and search the organisation's employee roster.
        </p>
      </div>

      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <div className="relative max-w-sm w-full">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search by employee number or email..."
            className="h-10 pl-9 border-gray-300 focus-visible:ring-2 focus-visible:ring-secondary w-full"
            aria-label="Search employees"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-6 py-4" role="alert">
          <p className="text-sm text-red-800">{error}</p>
          <button type="button" className="mt-3 h-9 px-4 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      <Card id="employee-table" className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-primary-light to-white">
          <h2 className="text-lg font-semibold text-gray-900">All Employees</h2>
          {!isEmpty && !isLoading && (
            <p className="text-sm text-gray-600 mt-0.5">
              Showing {showingFrom}&ndash;{showingTo} of {count} employees
            </p>
          )}
        </div>
        <CardContent className="p-0">
          {isLoading ? (
            <EmployeeTableSkeleton />
          ) : isEmpty ? (
            <div
              className="flex flex-col items-center justify-center py-16 px-6 text-center min-h-[200px]"
              aria-live="polite"
            >
              <Users2 className="h-12 w-12 text-gray-400 mb-3" aria-hidden="true" />
              <p className="text-base font-medium text-gray-600">
                {debouncedSearch
                  ? `No employees found matching "${debouncedSearch}".`
                  : "No employees found."}
              </p>
              {debouncedSearch && (
                <p className="text-sm text-gray-400 mt-1">
                  Try a different email, employee number, or clear the search.
                </p>
              )}
            </div>
          ) : (
            <EmployeeTable employees={employees} onRowClick={handleRowClick} />
          )}

          {!isLoading && !isEmpty && (
            <div
              className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 flex-wrap gap-2"
              aria-label="Pagination"
            >
              <span className="text-sm text-gray-600" aria-live="polite">
                Showing {showingFrom}&ndash;{showingTo} of {count} employees
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="h-8 px-3 rounded border border-gray-300 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!hasPreviousPage}
                  aria-label="Previous page"
                  aria-disabled={!hasPreviousPage}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="h-8 px-3 rounded border border-gray-300 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!hasNextPage}
                  aria-label="Next page"
                  aria-disabled={!hasNextPage}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
