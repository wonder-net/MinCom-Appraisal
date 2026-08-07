/**
 * CalibrationBoardPage — every SIGNED_OFF/FINALISED appraisal in one
 * department for the selected cycle, side by side, with a Complete/
 * Reopen action for HR Admin/System Admin (matches the backend's
 * IS_ADMIN gate on those two actions — everyone else can view the
 * board, matching IS_HR_STAFF). Product roadmap item, not one of the
 * 11 original HR change requests.
 */

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardCheck, ShieldAlert, ArrowLeft } from "lucide-react";
import { useReportsCycle } from "@/features/reports";
import { useAuth } from "@/auth/useAuth";
import { useCalibrationBoard } from "../hooks/useCalibrationBoard";

function BoardSkeleton() {
  return (
    <div className="space-y-3 p-6" aria-busy="true" aria-label="Loading calibration board">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

export function CalibrationBoardPage() {
  const { departmentId } = useParams<{ departmentId: string }>();
  const { cycleId } = useReportsCycle();
  const { user } = useAuth();
  const { data, isLoading, error, isForbidden, isSubmitting, actionError, complete, reopen, retry } =
    useCalibrationBoard(cycleId ?? undefined, departmentId);

  const [notes, setNotes] = useState("");

  const canAct = user?.roles.includes("HR_ADMIN") || user?.roles.includes("SYSTEM_ADMIN");
  const isComplete = data?.status === "COMPLETE";

  return (
    <div>
      <Link to="/reports/calibration" className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-3">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Calibration
      </Link>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">
        {data ? `Calibration — ${data.department_name}` : "Calibration"}
      </h2>

      <Card className="shadow-sm mt-4">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-secondary" aria-hidden="true" />
              Ratings
            </span>
            {data && (
              <Badge
                variant="outline"
                className={
                  isComplete
                    ? "text-xs bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "text-xs bg-amber-50 text-amber-700 border-amber-200"
                }
              >
                {isComplete ? "Complete" : "Pending"}
              </Badge>
            )}
          </CardTitle>
          {data?.completed_by_name && (
            <p className="text-xs text-gray-500 mt-1">
              Completed by {data.completed_by_name}
              {data.completed_at ? ` on ${new Date(data.completed_at).toLocaleDateString()}` : ""}
              {data.notes ? ` — "${data.notes}"` : ""}
            </p>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isForbidden && (
            <div className="m-6 flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-6 py-4" role="status">
              <ShieldAlert className="h-5 w-5 text-amber-600 flex-shrink-0" aria-hidden="true" />
              <p className="text-sm text-amber-800">You do not have permission to view this page.</p>
            </div>
          )}

          {error && !isForbidden && (
            <div className="m-6 rounded-md border border-red-200 bg-red-50 px-6 py-4" role="alert">
              <p className="text-sm text-red-800">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
                Retry
              </Button>
            </div>
          )}

          {isLoading && <BoardSkeleton />}

          {!isLoading && !error && !isForbidden && data && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Calibration ratings by employee">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left">
                      <th scope="col" className="px-6 py-3 font-semibold text-gray-900">Employee</th>
                      <th scope="col" className="px-6 py-3 font-semibold text-gray-900">Manager</th>
                      <th scope="col" className="px-6 py-3 font-semibold text-gray-900 text-right">KPI Avg</th>
                      <th scope="col" className="px-6 py-3 font-semibold text-gray-900 text-right">Core Values</th>
                      <th scope="col" className="px-6 py-3 font-semibold text-gray-900 text-right">Total</th>
                      <th scope="col" className="px-6 py-3 font-semibold text-gray-900">Descriptor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.appraisals.map((row, i) => (
                      <tr key={row.appraisal_id} className={`border-b border-gray-200 last:border-0 ${i % 2 === 1 ? "bg-gray-50" : "bg-white"}`}>
                        <td className="px-6 py-3 text-gray-900 font-medium">
                          <Link to={`/appraisals/${row.appraisal_id}`} className="text-primary hover:underline">
                            {row.employee_name}
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-gray-600">{row.manager_name ?? "—"}</td>
                        <td className="px-6 py-3 text-right font-mono">{row.kd_average_score ?? "—"}</td>
                        <td className="px-6 py-3 text-right font-mono">{row.bc_average_score ?? "—"}</td>
                        <td className="px-6 py-3 text-right font-mono font-semibold">{row.total_score ?? "—"}</td>
                        <td className="px-6 py-3 text-gray-600">{row.performance_descriptor ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {canAct && (
                <div className="border-t border-gray-200 px-6 py-4 space-y-3">
                  {actionError && (
                    <p role="alert" className="text-sm text-red-700">{actionError}</p>
                  )}
                  {isComplete ? (
                    <Button
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={() => void reopen()}
                      className="border-amber-300 text-amber-700 hover:bg-amber-50"
                    >
                      {isSubmitting ? "Reopening…" : "Reopen calibration"}
                    </Button>
                  ) : (
                    <>
                      <label htmlFor="calibration-notes" className="block text-sm font-medium text-gray-900">
                        Notes (optional)
                      </label>
                      <Textarea
                        id="calibration-notes"
                        rows={2}
                        placeholder="e.g. Reviewed with department heads, ratings consistent."
                        className="resize-none focus-visible:ring-2 focus-visible:ring-secondary"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                      <Button
                        disabled={isSubmitting}
                        onClick={() => void complete(notes || undefined)}
                        className="bg-primary text-white hover:bg-primary-dark"
                      >
                        {isSubmitting ? "Completing…" : "Mark calibration complete"}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
