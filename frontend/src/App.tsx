/**
 * App — Root routing component for the MINCOM Appraisal Platform.
 *
 * Route structure:
 * - /login           Public — LoginPage
 * - /unauthorized    Public — UnauthorizedPage (for role check failures)
 * - /mfa-setup       Protected — MFASetupPage
 * - /appraisals      Protected — AppraisalListPage (main page)
 * - /appraisals/:id  Protected — AppraisalDetailPage
 * - /admin/users     Protected + HR_ADMIN — AdminUsers page
 * - /employees       Protected — EmployeeListPage (all authenticated)
 * - /employees/:id   Protected — EmployeeProfilePage (all authenticated)
 * - /reports         Protected + HR_ADMIN|HR_OFFICER|EXECUTIVE — ReportsLayout
 *   - /reports       (index) ReportsDashboard
 *   - /reports/unapprised            HR_ADMIN|HR_OFFICER — UnapraisedEmployeesPage
 *   - /reports/score-distribution    HR_ADMIN|HR_OFFICER|EXECUTIVE — ScoreDistributionPage
 *   - /reports/competency-gaps       HR_ADMIN|HR_OFFICER — CompetencyGapsPage
 *   - /reports/manager-effectiveness HR_ADMIN|HR_OFFICER|EXECUTIVE — ManagerEffectivenessPage
 *   - /reports/disputes              HR_ADMIN|HR_OFFICER — DisputeLogPage
 *   - /reports/bsc-perspectives      HR_ADMIN|HR_OFFICER|EXECUTIVE — BSCPerspectivesPage
 *   - /reports/training-needs        HR_ADMIN|HR_OFFICER — TrainingNeedsPage
 *   - /reports/career-pipeline      HR_ADMIN|HR_OFFICER|EXECUTIVE — CareerAspirationPipelinePage
 *   - /reports/audit-compliance    HR_ADMIN|HR_OFFICER — AuditCompliancePage
 *   - /reports/trend              HR_ADMIN|HR_OFFICER|EXECUTIVE — CrossCycleTrendPage
 *   - /reports/descriptor-config HR_ADMIN — ScoreDescriptorConfigPage
 *   - /reports/variance          HR_ADMIN|HR_OFFICER|EXECUTIVE — SelfVsManagerVariancePage
 * - /reports/dashboard Redirect to /reports (backward compat)
 * - /audit/logs      Protected + HR_ADMIN|HR_OFFICER — AuditLogPage
 * - /settings/account Protected — AccountSettings (all authenticated)
 * - /help              Protected — HelpIndexPage (role-filtered TOC)
 * - /help/:section/:slug Protected — HelpPage (single manual page)
 * - /help/public                       Public layout (no auth)
 * - /help/public/:section/:slug        Public — PublicHelpPage
 *                                      (only `public: true` articles render)
 * - /dashboard       Redirects to /appraisals (legacy)
 * - *                Redirects to /appraisals (if auth) or /login (if not)
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "@/auth/LoginPage";
import MFASetupPage from "@/auth/MFASetupPage";
import ForceChangePasswordPage from "@/auth/ForceChangePasswordPage";
import ForgotPasswordPage from "@/features/auth/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/features/auth/pages/ResetPasswordPage";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { Layout } from "@/components/Layout";
import { UnauthorizedPage } from "@/pages/UnauthorizedPage";
import {
  AppraisalListPage,
  AppraisalDetailPage,
} from "@/features/appraisals";
import { AdminUsers, AdminCycles, AdminCompetencies, BulkImportResultsPage } from "@/features/admin";
import { AppraisalImportResultsPage } from "@/features/appraisals";
import {
  ReportsLayout,
  ReportsDashboard,
  UnapraisedEmployeesPage,
  ScoreDistributionPage,
  CompetencyGapsPage,
  ManagerEffectivenessPage,
  DisputeLogPage,
  BSCPerspectivesPage,
  TrainingNeedsPage,
  CareerAspirationPipelinePage,
  AuditCompliancePage,
  CrossCycleTrendPage,
  ScoreDescriptorConfigPage,
  SelfVsManagerVariancePage,
  NineBoxPage,
} from "@/features/reports";
import { EmployeeListPage, EmployeeProfilePage } from "@/features/employees";
import { AuditLogPage } from "@/features/audit";
import { AccountSettings } from "@/features/settings";
import {
  HelpIndexPage,
  HelpLayout,
  HelpPage,
  PublicHelpLayout,
  PublicHelpPage,
} from "@/features/help";
import { RoleGuard } from "@/auth/RoleGuard";
import { useAuth } from "@/auth/useAuth";

/**
 * Catch-all route that redirects based on authentication state.
 */
function CatchAllRedirect() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-gray-50"
        role="status"
        aria-label="Loading"
      >
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-secondary" />
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/appraisals" replace />;
  }

  return <Navigate to="/login" replace />;
}

export default function App() {
  // basename from Vite's `base` config (see vite.config.ts) — this app is
  // served off-root under some deployments (e.g. this MAMP environment's
  // `Alias /MinCom-Appraisal`); every route below stays written as if
  // mounted at "/", react-router resolves them relative to this
  // automatically.
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        {/* Public help articles (login-screen guides only).
            Hard-gated by the `public: true` frontmatter flag inside
            <PublicHelpPage> — non-public slugs render the not-found state. */}
        <Route path="/help/public" element={<PublicHelpLayout />}>
          <Route index element={<Navigate to="/login" replace />} />
          <Route path=":section/:slug" element={<PublicHelpPage />} />
        </Route>

        {/* Protected routes (authentication required) */}
        <Route element={<ProtectedRoute />}>
          <Route path="/mfa-setup" element={<MFASetupPage />} />
          <Route path="/change-password" element={<ForceChangePasswordPage />} />
          <Route element={<Layout />}>
            <Route path="/appraisals" element={<AppraisalListPage />} />
            <Route path="/appraisals/:id" element={<AppraisalDetailPage />} />
            <Route
              path="/admin/users"
              element={
                <RoleGuard
                  roles={["HR_ADMIN", "SYSTEM_ADMIN"]}
                  fallback={<Navigate to="/unauthorized" replace />}
                >
                  <AdminUsers />
                </RoleGuard>
              }
            />
            <Route
              path="/admin/users/import/:importId/results"
              element={
                <RoleGuard
                  roles={["HR_ADMIN", "SYSTEM_ADMIN"]}
                  fallback={<Navigate to="/unauthorized" replace />}
                >
                  <BulkImportResultsPage />
                </RoleGuard>
              }
            />
            <Route
              path="/admin/appraisals/import/:importId/results"
              element={
                <RoleGuard
                  roles={["HR_ADMIN", "SYSTEM_ADMIN"]}
                  fallback={<Navigate to="/unauthorized" replace />}
                >
                  <AppraisalImportResultsPage />
                </RoleGuard>
              }
            />
            <Route
              path="/admin/cycles"
              element={
                <RoleGuard
                  roles={["HR_ADMIN", "SYSTEM_ADMIN"]}
                  fallback={<Navigate to="/unauthorized" replace />}
                >
                  <AdminCycles />
                </RoleGuard>
              }
            />
            <Route
              path="/admin/competencies"
              element={
                <RoleGuard
                  roles={["HR_ADMIN", "SYSTEM_ADMIN"]}
                  fallback={<Navigate to="/unauthorized" replace />}
                >
                  <AdminCompetencies />
                </RoleGuard>
              }
            />
            <Route path="/employees" element={<EmployeeListPage />} />
            <Route path="/employees/:id" element={<EmployeeProfilePage />} />

            {/* Reports — nested under ReportsLayout */}
            <Route
              path="/reports"
              element={
                <RoleGuard
                  roles={["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER", "EXECUTIVE"]}
                  fallback={<Navigate to="/unauthorized" replace />}
                >
                  <ReportsLayout />
                </RoleGuard>
              }
            >
              <Route index element={<ReportsDashboard />} />
              <Route
                path="unapprised"
                element={
                  <RoleGuard
                    roles={["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER"]}
                    fallback={<Navigate to="/unauthorized" replace />}
                  >
                    <UnapraisedEmployeesPage />
                  </RoleGuard>
                }
              />
              <Route
                path="score-distribution"
                element={
                  <RoleGuard
                    roles={["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER", "EXECUTIVE"]}
                    fallback={<Navigate to="/unauthorized" replace />}
                  >
                    <ScoreDistributionPage />
                  </RoleGuard>
                }
              />
              <Route
                path="competency-gaps"
                element={
                  <RoleGuard
                    roles={["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER"]}
                    fallback={<Navigate to="/unauthorized" replace />}
                  >
                    <CompetencyGapsPage />
                  </RoleGuard>
                }
              />
              <Route
                path="manager-effectiveness"
                element={
                  <RoleGuard
                    roles={["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER", "EXECUTIVE"]}
                    fallback={<Navigate to="/unauthorized" replace />}
                  >
                    <ManagerEffectivenessPage />
                  </RoleGuard>
                }
              />
              <Route
                path="disputes"
                element={
                  <RoleGuard
                    roles={["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER"]}
                    fallback={<Navigate to="/unauthorized" replace />}
                  >
                    <DisputeLogPage />
                  </RoleGuard>
                }
              />
              <Route
                path="bsc-perspectives"
                element={
                  <RoleGuard
                    roles={["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER", "EXECUTIVE"]}
                    fallback={<Navigate to="/unauthorized" replace />}
                  >
                    <BSCPerspectivesPage />
                  </RoleGuard>
                }
              />
              <Route
                path="training-needs"
                element={
                  <RoleGuard
                    roles={["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER"]}
                    fallback={<Navigate to="/unauthorized" replace />}
                  >
                    <TrainingNeedsPage />
                  </RoleGuard>
                }
              />
              <Route
                path="career-pipeline"
                element={
                  <RoleGuard
                    roles={["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER", "EXECUTIVE"]}
                    fallback={<Navigate to="/unauthorized" replace />}
                  >
                    <CareerAspirationPipelinePage />
                  </RoleGuard>
                }
              />
              <Route
                path="trend"
                element={
                  <RoleGuard
                    roles={["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER", "EXECUTIVE"]}
                    fallback={<Navigate to="/unauthorized" replace />}
                  >
                    <CrossCycleTrendPage />
                  </RoleGuard>
                }
              />
              <Route
                path="audit-compliance"
                element={
                  <RoleGuard
                    roles={["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER"]}
                    fallback={<Navigate to="/unauthorized" replace />}
                  >
                    <AuditCompliancePage />
                  </RoleGuard>
                }
              />
              <Route
                path="descriptor-config"
                element={
                  <RoleGuard
                    roles={["HR_ADMIN", "SYSTEM_ADMIN"]}
                    fallback={<Navigate to="/unauthorized" replace />}
                  >
                    <ScoreDescriptorConfigPage />
                  </RoleGuard>
                }
              />
              <Route
                path="variance"
                element={
                  <RoleGuard
                    roles={["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER", "EXECUTIVE"]}
                    fallback={<Navigate to="/unauthorized" replace />}
                  >
                    <SelfVsManagerVariancePage />
                  </RoleGuard>
                }
              />
              <Route
                path="nine-box"
                element={
                  <RoleGuard
                    roles={["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER", "EXECUTIVE"]}
                    fallback={<Navigate to="/unauthorized" replace />}
                  >
                    <NineBoxPage />
                  </RoleGuard>
                }
              />
              {/* Backward compat: /reports/dashboard -> /reports */}
              <Route
                path="dashboard"
                element={<Navigate to="/reports" replace />}
              />
            </Route>

            <Route
              path="/audit/logs"
              element={
                <RoleGuard
                  roles={["HR_ADMIN", "SYSTEM_ADMIN", "HR_OFFICER"]}
                  fallback={<Navigate to="/unauthorized" replace />}
                >
                  <AuditLogPage />
                </RoleGuard>
              }
            />
            <Route path="/settings/account" element={<AccountSettings />} />
            <Route path="/help" element={<HelpLayout />}>
              <Route index element={<HelpIndexPage />} />
              <Route path=":section/:slug" element={<HelpPage />} />
            </Route>
          </Route>
        </Route>

        {/* Legacy /dashboard redirect */}
        <Route
          path="/dashboard"
          element={<Navigate to="/appraisals" replace />}
        />

        {/* Catch-all */}
        <Route path="*" element={<CatchAllRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}
