/**
 * EmployeeProfilePage — Employee detail view with profile card
 * and optional direct reports section.
 * Route: /employees/:id (all authenticated users)
 */

import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Users2, UserCircle } from "lucide-react";
import { useEmployeeProfile } from "../hooks/useEmployeeProfile";
import { AccountCard } from "../components/AccountCard";
import { EmployeeAppraisalHistorySection } from "@/features/reports/components/EmployeeAppraisalHistorySection";
import { useAuth } from "@/auth/useAuth";
import { isAdminUser } from "@/auth/role-helpers";

function ProfileSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading profile">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-6 w-48" />
      </div>
    </div>
  );
}

interface ProfileFieldProps {
  label: string;
  children: React.ReactNode;
}

function ProfileField({ label, children }: ProfileFieldProps) {
  return (
    <div>
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

export function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const safeId = useMemo(() => id ?? "", [id]);
  const { user } = useAuth();

  // Admin-tier gate: HR_ADMIN and SYSTEM_ADMIN see the AccountCard with
  // sensitive account details (TASK-303). Variable name preserved for the
  // existing render path; predicate now covers both admin-tier roles.
  const isHrAdmin = useMemo(() => isAdminUser(user), [user]);

  const {
    employee,
    directReports,
    isLoading,
    isNotFound,
    error,
    canSeeDirectReports,
    retry,
  } = useEmployeeProfile(safeId);

  return (
    <main
      className="min-h-screen bg-gray-50 px-4 sm:px-6 md:px-12 py-8 max-w-[1280px] mx-auto"
      aria-label="Employee profile"
    >
      {/* Breadcrumb */}
      <Link
        to="/employees"
        className="inline-flex items-center gap-1 text-sm text-secondary hover:underline mb-6"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Employee Directory
      </Link>

      {/* Error state */}
      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-6 py-4" role="alert">
          <p className="text-sm text-red-800">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
            Retry
          </Button>
        </div>
      )}

      {/* Not found state */}
      {isNotFound && (
        <div
          className="flex flex-col items-center justify-center py-16 text-center"
          aria-live="polite"
        >
          <UserCircle className="h-12 w-12 text-gray-400 mb-3" aria-hidden="true" />
          <p className="text-base font-medium text-gray-500">Employee not found.</p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <ProfileSkeleton />
          </CardContent>
        </Card>
      )}

      {/* Profile card */}
      {!isLoading && !isNotFound && employee && (
        <>
          <Card className="shadow-sm mb-6">
            <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4 flex flex-row items-center gap-4">
              {employee.photo_url ? (
                <img
                  src={employee.photo_url}
                  alt=""
                  className="h-14 w-14 rounded-full object-cover border border-gray-200 flex-shrink-0"
                />
              ) : null}
              <CardTitle className="text-2xl font-semibold text-gray-900">
                {employee.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <ProfileField label="Job Title">
                  {employee.job_title}
                </ProfileField>
                <ProfileField label="Directorate / Department">
                  {employee.department_detail?.full_label ??
                    employee.department_full_label ??
                    employee.department_detail?.name ??
                    employee.department_name ??
                    "—"}
                </ProfileField>
                <ProfileField label="Job Family">
                  {employee.job_family || "—"}
                </ProfileField>
                <ProfileField label="Location">
                  {employee.location || "—"}
                </ProfileField>
                <ProfileField label="Employee Number">
                  {employee.employee_number}
                </ProfileField>
                <ProfileField label="Classification">
                  {employee.classification_display}
                </ProfileField>
                <ProfileField label="Manager">
                  {employee.manager_name ?? "N/A"}
                </ProfileField>
                <ProfileField label="Matrix Appraiser">
                  {employee.matrix_appraiser_name ?? "N/A"}
                </ProfileField>
              </dl>
            </CardContent>
          </Card>

          {/* Account details (HR Admin only) */}
          {isHrAdmin && employee.user_detail && (
            <div className="mb-6">
              <AccountCard userDetail={employee.user_detail} />
            </div>
          )}

          {/* Direct Reports section */}
          {canSeeDirectReports && (
            <Card className="shadow-sm mb-6">
              <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
                <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Users2 className="h-5 w-5 text-secondary" aria-hidden="true" />
                  Direct Reports
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {directReports.length === 0 ? (
                  <p className="text-sm text-gray-500">No direct reports.</p>
                ) : (
                  <ul className="space-y-3" role="list">
                    {directReports.map((report) => (
                      <li key={report.id} className="flex items-center gap-3">
                        <Link
                          to={`/employees/${report.id}`}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          {report.name}
                        </Link>
                        <span className="text-sm text-gray-500">
                          {report.job_title}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          {/* Appraisal History section */}
          <EmployeeAppraisalHistorySection employeeId={safeId} />
        </>
      )}
    </main>
  );
}
