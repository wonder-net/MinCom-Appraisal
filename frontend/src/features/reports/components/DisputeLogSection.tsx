/**
 * DisputeLogSection — Displays disputes and rejections from the
 * appraisal signing process for the selected cycle.
 */

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";
import { useDisputeLog } from "../hooks/useDisputeLog";
import { formatCommentTimestamp } from "@/utils/format-date";
import type { DisputeLogRow } from "@/api/reports";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function formatAction(action: DisputeLogRow["signature_action"]): string {
  if (action === null) return "Disputed (no signature)";
  if (action === "REJECT") return "Reject";
  if (action === "COMMENTS_ATTACHED") return "Comments Attached";
  return action;
}

function actionBadgeClass(action: DisputeLogRow["signature_action"]): string {
  if (action === "REJECT") return "bg-red-50 text-red-700 border-red-200";
  if (action === "COMMENTS_ATTACHED")
    return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-gray-100 text-gray-600 border-gray-300";
}

function resolutionBadgeClass(status: string): string {
  if (status === "FINALISED") return "bg-green-50 text-green-700 border-green-300";
  if (status === "DISPUTED") return "bg-red-50 text-red-700 border-red-200";
  if (status === "DISCUSSION")
    return "bg-purple-50 text-purple-700 border-purple-200";
  return "bg-gray-100 text-gray-600 border-gray-300";
}

function formatResolution(status: string): string {
  const labels: Record<string, string> = {
    DISCUSSION: "Discussion",
    DISPUTED: "Disputed",
    FINALISED: "Finalised",
  };
  return labels[status] ?? status;
}

function formatRole(role: DisputeLogRow["signer_role"]): string {
  if (role === "APPRAISER") return "Appraisor";
  if (role === "APPRAISEE") return "Appraisee";
  return "\u2014";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DisputeLogSkeleton() {
  return (
    <div
      className="animate-pulse space-y-3 p-6"
      aria-busy="true"
      aria-label="Loading dispute log"
    >
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

interface DisputeTableProps {
  rows: DisputeLogRow[];
}

function DisputeTable({ rows }: DisputeTableProps) {
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full text-sm"
        aria-label="Dispute and rejection log table"
      >
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left">
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900">
              Employee
            </th>
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900">
              Department
            </th>
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900">
              Cycle
            </th>
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900">
              Signed At
            </th>
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900">
              Action
            </th>
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900">
              Reason
            </th>
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900">
              Role
            </th>
            <th scope="col" className="px-6 py-3 font-semibold text-gray-900">
              Resolution Status
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
                {row.employee_name}
              </td>
              <td className="px-6 py-3 text-gray-500">
                {row.department_name}
              </td>
              <td className="px-6 py-3 text-gray-500">{row.cycle_name}</td>
              <td className="px-6 py-3 text-gray-500">
                {row.signed_at ? formatCommentTimestamp(row.signed_at) : "\u2014"}
              </td>
              <td className="px-6 py-3">
                <Badge
                  variant="outline"
                  className={`text-xs ${actionBadgeClass(row.signature_action)}`}
                >
                  {formatAction(row.signature_action)}
                </Badge>
              </td>
              <td className="px-6 py-3 text-gray-500 max-w-xs truncate">
                {row.rejection_reason ?? "\u2014"}
              </td>
              <td className="px-6 py-3 text-gray-500">
                {formatRole(row.signer_role)}
              </td>
              <td className="px-6 py-3">
                <Badge
                  variant="outline"
                  className={`text-xs ${resolutionBadgeClass(row.resolution_status)}`}
                >
                  {formatResolution(row.resolution_status)}
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

interface DisputeLogSectionProps {
  cycleId?: string;
}

export function DisputeLogSection({ cycleId }: DisputeLogSectionProps) {
  const { data, isLoading, error, retry } = useDisputeLog(cycleId);

  if (!cycleId) {
    return null;
  }

  const isEmpty = data !== null && data.disputes.length === 0;

  return (
    <section aria-label="Dispute and rejection log">
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle
              className="h-5 w-5 text-secondary"
              aria-hidden="true"
            />
            Dispute and Rejection Log
            {data !== null && (
              <Badge
                variant="secondary"
                aria-label={`${data.count} disputes or rejections`}
              >
                {data.count}
              </Badge>
            )}
          </CardTitle>
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
          {isLoading && <DisputeLogSkeleton />}

          {/* Empty state */}
          {!isLoading && !error && isEmpty && (
            <div
              className="flex flex-col items-center justify-center py-16 text-center"
              aria-live="polite"
            >
              <AlertTriangle
                className="h-12 w-12 text-gray-400 mb-3"
                aria-hidden="true"
              />
              <p className="text-base font-medium text-gray-500">
                No disputes or rejections recorded for this cycle.
              </p>
            </div>
          )}

          {/* Table */}
          {!isLoading && !error && data && data.disputes.length > 0 && (
            <DisputeTable rows={data.disputes} />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
