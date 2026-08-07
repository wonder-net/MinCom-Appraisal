/**
 * CalibrationOverviewPage — one row per department with calibration-
 * ready (SIGNED_OFF/FINALISED) appraisals in the selected cycle.
 * Product roadmap item, not one of the 11 original HR change requests.
 */

import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardCheck, ShieldAlert } from "lucide-react";
import { useReportsCycle } from "@/features/reports";
import { useCalibrationOverview } from "../hooks/useCalibrationOverview";

function OverviewSkeleton() {
  return (
    <div className="space-y-3 p-6" aria-busy="true" aria-label="Loading calibration overview">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

export function CalibrationOverviewPage() {
  const { cycleId } = useReportsCycle();
  const { data, isLoading, error, isForbidden, retry } = useCalibrationOverview(cycleId ?? undefined);

  const isEmpty = data !== null && data.departments.length === 0;

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Calibration</h2>
      <p className="text-sm text-gray-500 mb-4">
        Compare ratings across managers by department before finalizing. A department&rsquo;s
        SIGNED_OFF appraisals can&rsquo;t reach FINALISED until its calibration is marked
        complete here.
      </p>

      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-secondary" aria-hidden="true" />
            Departments
          </CardTitle>
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

          {isLoading && <OverviewSkeleton />}

          {!isLoading && !error && !isForbidden && isEmpty && (
            <div className="flex flex-col items-center justify-center py-16 text-center" aria-live="polite">
              <ClipboardCheck className="h-12 w-12 text-gray-400 mb-3" aria-hidden="true" />
              <p className="text-base font-medium text-gray-500">
                No departments have calibration-ready appraisals in this cycle yet.
              </p>
            </div>
          )}

          {!isLoading && !error && !isForbidden && data && !isEmpty && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Calibration overview by department">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left">
                    <th scope="col" className="px-6 py-3 font-semibold text-gray-900">Department</th>
                    <th scope="col" className="px-6 py-3 font-semibold text-gray-900 text-right">Signed Off</th>
                    <th scope="col" className="px-6 py-3 font-semibold text-gray-900 text-right">Finalised</th>
                    <th scope="col" className="px-6 py-3 font-semibold text-gray-900">Status</th>
                    <th scope="col" className="px-6 py-3 font-semibold text-gray-900" />
                  </tr>
                </thead>
                <tbody>
                  {data.departments.map((dept, i) => (
                    <tr key={dept.department_id} className={`border-b border-gray-200 last:border-0 ${i % 2 === 1 ? "bg-gray-50" : "bg-white"}`}>
                      <td className="px-6 py-3 text-gray-900 font-medium">{dept.department_name}</td>
                      <td className="px-6 py-3 text-right font-mono">{dept.signed_off_count}</td>
                      <td className="px-6 py-3 text-right font-mono">{dept.finalised_count}</td>
                      <td className="px-6 py-3">
                        <Badge
                          variant="outline"
                          className={
                            dept.status === "COMPLETE"
                              ? "text-xs bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "text-xs bg-amber-50 text-amber-700 border-amber-200"
                          }
                        >
                          {dept.status === "COMPLETE" ? "Complete" : "Pending"}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link
                          to={`/reports/calibration/${dept.department_id}`}
                          className="text-primary hover:underline text-sm font-medium"
                        >
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
