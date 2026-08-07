/**
 * Reports feature module for the MINCOM Appraisal Platform.
 *
 * This module contains:
 * - Department-level appraisal reports
 * - Training needs analysis reports
 * - PDF generation triggers and download handlers
 * - Export functionality (CSV, PDF)
 * - Executive-level read-only dashboard views
 *
 * Core API endpoints:
 * - GET /api/v1/reports/dashboard/
 * - GET /api/v1/reports/department/{dept_id}/
 * - GET /api/v1/reports/training-needs/
 * - GET /api/v1/appraisals/{id}/pdf/
 */

// Layout and context
export { ReportsLayout } from "./pages/ReportsLayout";
export { useReportsCycle } from "./context/ReportsCycleContext";

// Pages
export { ReportsDashboard } from "./pages/ReportsDashboard";
export { UnapraisedEmployeesPage } from "./pages/UnapraisedEmployeesPage";
export { ScoreDistributionPage } from "./pages/ScoreDistributionPage";
export { CompetencyGapsPage } from "./pages/CompetencyGapsPage";
export { ManagerEffectivenessPage } from "./pages/ManagerEffectivenessPage";
export { DisputeLogPage } from "./pages/DisputeLogPage";
export { BSCPerspectivesPage } from "./pages/BSCPerspectivesPage";
export { TrainingNeedsPage } from "./pages/TrainingNeedsPage";
export { CareerAspirationPipelinePage } from "./pages/CareerAspirationPipelinePage";
export { AuditCompliancePage } from "./pages/AuditCompliancePage";
export { CrossCycleTrendPage } from "./pages/CrossCycleTrendPage";
export { ScoreDescriptorConfigPage } from "./pages/ScoreDescriptorConfigPage";
export { SelfVsManagerVariancePage } from "./pages/SelfVsManagerVariancePage";

// Shared components
export { DepartmentDrillDown } from "./components/DepartmentDrillDown";
export { CSVExportButton } from "./components/CSVExportButton";
export { ScoreDistributionSection } from "./components/ScoreDistributionSection";
export { EmployeeAppraisalHistorySection } from "./components/EmployeeAppraisalHistorySection";
