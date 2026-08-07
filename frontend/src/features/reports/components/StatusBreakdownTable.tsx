/**
 * StatusBreakdownTable — renders appraisals grouped by workflow status
 * with count and percentage columns.
 */

import { useMemo } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface StatusBreakdownTableProps {
  appraisalsByStatus: Record<string, number>;
}

const STATUS_LABELS: Record<string, string> = {
  SELF_ASSESSMENT: "Self Assessment",
  MANAGER_REVIEW: "Manager Review",
  DISCUSSION: "Discussion",
  GROWTH_PLANNING: "Growth Planning",
  PENDING_SIGNOFF: "Pending Sign-off",
  SIGNED_OFF: "Signed Off",
  FINALISED: "Finalised",
  EXCLUDED: "Excluded",
  INCOMPLETE: "Incomplete",
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  SELF_ASSESSMENT: "bg-blue-50 text-blue-700 border-blue-200",
  MANAGER_REVIEW: "bg-amber-50 text-amber-700 border-amber-200",
  DISCUSSION: "bg-purple-50 text-purple-700 border-purple-200",
  GROWTH_PLANNING: "bg-teal-50 text-teal-700 border-teal-200",
  PENDING_SIGNOFF: "bg-orange-50 text-orange-700 border-orange-200",
  SIGNED_OFF: "bg-green-50 text-green-700 border-green-300",
  FINALISED: "bg-primary-light text-primary border-primary",
  EXCLUDED: "bg-red-50 text-red-700 border-red-200",
  INCOMPLETE: "bg-gray-50 text-gray-500 border-gray-300",
};

/** Pure: convert Record to sorted array + compute total */
function buildRows(byStatus: Record<string, number>) {
  const entries = Object.entries(byStatus).map(([status, count]) => ({
    status,
    count,
  }));
  const total = entries.reduce((sum, row) => sum + row.count, 0);
  return { entries, total };
}

/** Pure: format percentage to 1 decimal */
function formatPct(count: number, total: number): string {
  return total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
}

export function StatusBreakdownTable({
  appraisalsByStatus,
}: StatusBreakdownTableProps) {
  const { entries, total } = useMemo(
    () => buildRows(appraisalsByStatus),
    [appraisalsByStatus],
  );

  return (
    <section aria-label="Appraisals by status">
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <CardTitle className="text-lg font-semibold text-gray-900">
            Status Breakdown
          </CardTitle>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} total appraisals across all statuses
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {total === 0 ? (
            <p className="text-center text-sm text-gray-500 py-10">
              No appraisal data for the current cycle.
            </p>
          ) : (
            <table
              className="w-full text-sm"
              aria-label="Status breakdown table"
            >
              <thead>
                <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100 bg-gray-50">
                  <th
                    scope="col"
                    className="px-4 py-2 text-left font-semibold"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2 text-right font-semibold"
                  >
                    Count
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2 text-right font-semibold"
                  >
                    % of Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((row, i) => (
                  <tr
                    key={row.status}
                    className={`${
                      i % 2 === 1 ? "bg-gray-50" : "bg-white"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          STATUS_BADGE_CLASSES[row.status] ?? ""
                        }`}
                      >
                        {STATUS_LABELS[row.status] ?? row.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {row.count}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {formatPct(row.count, total)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
