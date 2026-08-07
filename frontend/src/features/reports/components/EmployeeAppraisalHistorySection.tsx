/**
 * EmployeeAppraisalHistorySection — Displays appraisal history for
 * a specific employee in a table. Renders inline on the employee
 * profile page. Handles loading, error, empty, and 403 states.
 */

import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { History, ShieldAlert } from "lucide-react";
import { useEmployeeAppraisalHistory } from "../hooks/useEmployeeAppraisalHistory";
import { formatScore, scoreColour } from "@/utils/format";
import type { AppraisalHistoryRow } from "@/api/reports";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function statusBadgeClass(status: string): string {
  switch (status) {
    case "FINALISED":
    case "SIGNED_OFF":
      return "bg-green-50 text-green-700 border-green-300";
    case "SELF_ASSESSMENT":
      return "bg-gray-100 text-gray-600 border-gray-300";
    case "DISPUTED":
      return "bg-red-50 text-red-700 border-red-200";
    case "EXCLUDED":
    case "INCOMPLETE":
      return "bg-gray-100 text-gray-500 border-gray-300";
    default:
      return "bg-blue-50 text-blue-700 border-blue-200";
  }
}

function formatStatus(status: string): string {
  const labels: Record<string, string> = {
    SELF_ASSESSMENT: "Self Assessment",
    MANAGER_REVIEW: "Manager Review",
    DISCUSSION: "Discussion",
    GROWTH_PLANNING: "Growth Planning",
    PENDING_SIGNOFF: "Pending Sign-off",
    SIGNED_OFF: "Signed Off",
    FINALISED: "Finalised",
    DISPUTED: "Disputed",
    EXCLUDED: "Excluded",
    INCOMPLETE: "Incomplete",
  };
  return labels[status] ?? status;
}

function descriptorBadgeClass(descriptor: string | null): string {
  if (!descriptor) return "bg-gray-100 text-gray-500 border-gray-300";
  if (descriptor === "Outstanding" || descriptor === "Exceeds Expectations") {
    return "bg-green-50 text-green-700 border-green-300";
  }
  if (descriptor === "Fully Competent") {
    return "bg-blue-50 text-blue-700 border-blue-200";
  }
  if (descriptor === "Generally Performing") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  return "bg-red-50 text-red-700 border-red-200";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HistorySkeleton() {
  return (
    <div
      className="animate-pulse space-y-3 p-6"
      aria-busy="true"
      aria-label="Loading appraisal history"
    >
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

interface HistoryTableProps {
  rows: AppraisalHistoryRow[];
}

function HistoryTable({ rows }: HistoryTableProps) {
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full text-sm"
        aria-label="Employee appraisal history table"
      >
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left">
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900">
              Cycle Name
            </th>
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900">
              Year
            </th>
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900 text-right">
              KD Score
            </th>
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900 text-right">
              BC Score
            </th>
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900 text-right">
              Total Score
            </th>
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900">
              Performance Descriptor
            </th>
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.appraisal_id}
              className={`border-b border-gray-200 last:border-0 ${
                i % 2 === 1 ? "bg-gray-50" : "bg-white"
              }`}
            >
              <td className="px-6 py-3 text-gray-900 font-medium">
                <Link
                  to={`/appraisals/${row.appraisal_id}`}
                  className="text-primary hover:underline"
                >
                  {row.cycle_name}
                </Link>
              </td>
              <td className="px-6 py-3 text-gray-500">
                {row.cycle_year}
              </td>
              <td className={`px-6 py-3 text-right font-mono ${scoreColour(row.kd_average_score)}`}>
                {formatScore(row.kd_average_score)}
              </td>
              <td className={`px-6 py-3 text-right font-mono ${scoreColour(row.bc_average_score)}`}>
                {formatScore(row.bc_average_score)}
              </td>
              <td className={`px-6 py-3 text-right font-mono font-semibold ${scoreColour(row.total_score)}`}>
                {formatScore(row.total_score)}
              </td>
              <td className="px-6 py-3">
                <Badge
                  variant="outline"
                  className={`text-xs ${descriptorBadgeClass(row.performance_descriptor)}`}
                >
                  {row.performance_descriptor ?? "\u2014"}
                </Badge>
              </td>
              <td className="px-6 py-3">
                <Badge
                  variant="outline"
                  className={`text-xs ${statusBadgeClass(row.appraisal_status)}`}
                >
                  {formatStatus(row.appraisal_status)}
                </Badge>
              </td>
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

interface EmployeeAppraisalHistorySectionProps {
  employeeId: string;
}

export function EmployeeAppraisalHistorySection({
  employeeId,
}: EmployeeAppraisalHistorySectionProps) {
  const { data, isLoading, error, isForbidden, retry } =
    useEmployeeAppraisalHistory(employeeId);

  const isEmpty = data !== null && data.history.length === 0;

  return (
    <section aria-label="Appraisal history">
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <History
              className="h-5 w-5 text-secondary"
              aria-hidden="true"
            />
            Appraisal History
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* 403 Forbidden state */}
          {isForbidden && (
            <div
              className="m-6 flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-6 py-4"
              role="status"
            >
              <ShieldAlert
                className="h-5 w-5 text-amber-600 flex-shrink-0"
                aria-hidden="true"
              />
              <p className="text-sm text-amber-800">
                You do not have permission to view this history.
              </p>
            </div>
          )}

          {/* Error state */}
          {error && !isForbidden && (
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
          {isLoading && <HistorySkeleton />}

          {/* Empty state */}
          {!isLoading && !error && !isForbidden && isEmpty && (
            <div
              className="flex flex-col items-center justify-center py-16 text-center"
              aria-live="polite"
            >
              <History
                className="h-12 w-12 text-gray-400 mb-3"
                aria-hidden="true"
              />
              <p className="text-base font-medium text-gray-500">
                No appraisal history found.
              </p>
            </div>
          )}

          {/* Table */}
          {!isLoading && !error && !isForbidden && data && data.history.length > 0 && (
            <HistoryTable rows={data.history} />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
