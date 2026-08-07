/**
 * API service functions for reports endpoints.
 *
 * All functions use the centralised apiClient with JWT interceptors.
 * The response interceptor automatically unwraps the standard
 * { status, data, meta } envelope.
 */

import { apiClient } from "./client";
import type {
  DashboardReport,
  DepartmentReport,
  ScoreDistributionReport,
} from "@/types";

/**
 * A recommended course within the training needs report.
 */
export interface RecommendedCourse {
  title: string;
  institution: string;
  priority: "FIRST" | "SECOND" | "THIRD";
}

/**
 * A training need priority group — backend groups by priority,
 * returning count and descriptions per group.
 */
export interface TrainingNeedGroup {
  priority: "FIRST" | "SECOND" | "THIRD";
  count: number;
  descriptions: string[];
}

/**
 * Training needs report response shape.
 */
export interface TrainingNeedsReport {
  cycle_id: string | null;
  training_needs: TrainingNeedGroup[];
  recommended_courses: RecommendedCourse[];
}

/**
 * Build a query string with an optional cycle_id parameter.
 * Returns an empty string when cycleId is undefined.
 */
function buildCycleQuery(cycleId?: string): string {
  return cycleId ? `?cycle_id=${encodeURIComponent(cycleId)}` : "";
}

/**
 * Fetch the reports dashboard summary.
 * GET /api/v1/reports/dashboard/
 */
export async function getDashboardReport(
  cycleId?: string,
): Promise<DashboardReport> {
  const response = await apiClient.get<DashboardReport>(
    `reports/dashboard/${buildCycleQuery(cycleId)}`,
  );
  return response.data;
}

/**
 * Fetch a detailed department report.
 * GET /api/v1/reports/department/{deptId}/
 */
export async function getDepartmentReport(
  deptId: string,
  cycleId?: string,
): Promise<DepartmentReport> {
  const response = await apiClient.get<DepartmentReport>(
    `reports/department/${deptId}/${buildCycleQuery(cycleId)}`,
  );
  return response.data;
}

/**
 * Fetch the training needs report.
 * GET /api/v1/reports/training-needs/
 */
export async function getTrainingNeeds(
  cycleId?: string,
): Promise<TrainingNeedsReport> {
  const response = await apiClient.get<TrainingNeedsReport>(
    `reports/training-needs/${buildCycleQuery(cycleId)}`,
  );
  return response.data;
}

/**
 * An employee with no appraisal in the selected cycle.
 */
export interface UnapraisedEmployee {
  employee_id: string;
  employee_number: string;
  name: string;
  job_title: string;
  department_name: string;
  manager_name: string;
}

/**
 * Unapprised employees report response shape.
 */
export interface UnapraisedReport {
  cycle_id: string | null;
  count: number;
  employees: UnapraisedEmployee[];
}

/**
 * Build a query string with optional cycle_id and department_id parameters.
 */
function buildUnapraisedQuery(cycleId?: string, departmentId?: string): string {
  const params: string[] = [];
  if (cycleId) {
    params.push(`cycle_id=${encodeURIComponent(cycleId)}`);
  }
  if (departmentId) {
    params.push(`department_id=${encodeURIComponent(departmentId)}`);
  }
  return params.length > 0 ? `?${params.join("&")}` : "";
}

/**
 * Fetch the unapprised employees report.
 * GET /api/v1/reports/unapprised/
 */
export async function getUnapraisedReport(
  cycleId?: string,
  departmentId?: string,
): Promise<UnapraisedReport> {
  const response = await apiClient.get<UnapraisedReport>(
    `reports/unapprised/${buildUnapraisedQuery(cycleId, departmentId)}`,
  );
  return response.data;
}

/**
 * A single BSC perspective row returned by the BSC perspectives endpoint.
 */
export interface BSCPerspectiveRow {
  perspective_id: string;
  perspective_name: string;
  avg_weighted_score: number | null;
  appraisal_count: number;
}

/**
 * BSC perspective breakdown report response shape.
 */
export interface BSCPerspectiveReport {
  cycle_id: string | null;
  perspectives: BSCPerspectiveRow[];
}

/**
 * Parameters for the BSC perspectives endpoint.
 */
export interface BSCPerspectiveParams {
  cycleId?: string;
  departmentId?: string;
}

/**
 * Build a query string for the BSC perspectives endpoint.
 * Omits params that are empty/undefined.
 */
function buildBSCPerspectiveQuery(params: BSCPerspectiveParams): string {
  const parts: string[] = [];
  if (params.cycleId) {
    parts.push(`cycle_id=${encodeURIComponent(params.cycleId)}`);
  }
  if (params.departmentId) {
    parts.push(`department_id=${encodeURIComponent(params.departmentId)}`);
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

/**
 * Fetch the BSC perspective breakdown report.
 * GET /api/v1/reports/bsc-perspectives/
 */
export async function getBSCPerspectives(
  params: BSCPerspectiveParams,
): Promise<BSCPerspectiveReport> {
  const response = await apiClient.get<BSCPerspectiveReport>(
    `reports/bsc-perspectives/${buildBSCPerspectiveQuery(params)}`,
  );
  return response.data;
}

/**
 * Parameters for the score distribution endpoint.
 */
export interface ScoreDistributionParams {
  cycleId?: string;
  departmentId?: string;
  formType?: "FORM_A" | "FORM_B" | "";
  jobFamily?: string;
}

/**
 * Build a query string for the score-distribution endpoint.
 * Omits params that are empty/undefined.
 */
function buildScoreDistributionQuery(params: ScoreDistributionParams): string {
  const parts: string[] = [];
  if (params.cycleId) {
    parts.push(`cycle_id=${encodeURIComponent(params.cycleId)}`);
  }
  if (params.departmentId) {
    parts.push(`department_id=${encodeURIComponent(params.departmentId)}`);
  }
  if (params.formType) {
    parts.push(`form_type=${encodeURIComponent(params.formType)}`);
  }
  if (params.jobFamily) {
    parts.push(`job_family=${encodeURIComponent(params.jobFamily)}`);
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

/**
 * Fetch the score distribution report.
 * GET /api/v1/reports/score-distribution/
 */
export async function getScoreDistribution(
  params: ScoreDistributionParams,
): Promise<ScoreDistributionReport> {
  const response = await apiClient.get<ScoreDistributionReport>(
    `reports/score-distribution/${buildScoreDistributionQuery(params)}`,
  );
  return response.data;
}

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

/**
 * Extract the filename from a Content-Disposition response header.
 * Falls back to a default name when the header is absent or unparseable.
 */
function extractFilename(
  contentDisposition: string | undefined,
  fallback: string,
): string {
  if (!contentDisposition) return fallback;
  const match = contentDisposition.match(/filename="?([^";\n]+)"?/);
  return match?.[1]?.trim() ?? fallback;
}

/**
 * Download the bulk CSV export of appraisals.
 * GET /api/v1/reports/export/csv/
 *
 * Requests a blob response, creates an object URL, and triggers a
 * programmatic download via a hidden anchor element. The object URL
 * is revoked immediately after the click to prevent memory leaks.
 */
export async function downloadAppraisalsCSV(
  cycleId?: string,
): Promise<void> {
  const response = await apiClient.get<Blob>(
    `reports/export/csv/${buildCycleQuery(cycleId)}`,
    { responseType: "blob" },
  );

  const filename = extractFilename(
    response.headers["content-disposition"] as string | undefined,
    "appraisals_export.csv",
  );

  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Dispute & Rejection Log
// ---------------------------------------------------------------------------

/**
 * A single row in the dispute/rejection log report.
 */
export interface DisputeLogRow {
  appraisal_id: string;
  employee_name: string;
  department_name: string;
  cycle_name: string;
  signed_at: string | null;
  signature_action: "REJECT" | "COMMENTS_ATTACHED" | null;
  rejection_reason: string | null;
  signer_role: "APPRAISER" | "APPRAISEE" | null;
  resolution_status: string;
}

/**
 * Response shape for the dispute log report endpoint.
 */
export interface DisputeLogReport {
  cycle_id: string | null;
  count: number;
  disputes: DisputeLogRow[];
}

/**
 * Fetch the dispute and rejection log report.
 * GET /api/v1/reports/disputes/
 */
export async function getDisputeLog(
  cycleId?: string,
): Promise<DisputeLogReport> {
  const response = await apiClient.get<DisputeLogReport>(
    `reports/disputes/${buildCycleQuery(cycleId)}`,
  );
  return response.data;
}

// ---------------------------------------------------------------------------
// Manager Effectiveness
// ---------------------------------------------------------------------------

/**
 * A single manager row in the manager effectiveness report.
 */
export interface ManagerEffectivenessRow {
  manager_id: string;
  manager_name: string;
  team_size: number;
  completion_rate: number;
  avg_team_score: number | null;
  dispute_count: number;
}

/**
 * Manager effectiveness report response shape.
 */
export interface ManagerEffectivenessReport {
  cycle_id: string | null;
  department_id: string | null;
  managers: ManagerEffectivenessRow[];
}

/**
 * Build a query string with optional cycle_id and department_id parameters
 * for the manager effectiveness endpoint.
 */
function buildManagerEffectivenessQuery(
  cycleId?: string,
  departmentId?: string,
): string {
  const params: string[] = [];
  if (cycleId) {
    params.push(`cycle_id=${encodeURIComponent(cycleId)}`);
  }
  if (departmentId) {
    params.push(`department_id=${encodeURIComponent(departmentId)}`);
  }
  return params.length > 0 ? `?${params.join("&")}` : "";
}

/**
 * Fetch the manager effectiveness report.
 * GET /api/v1/reports/manager-effectiveness/
 */
export async function getManagerEffectiveness(
  cycleId?: string,
  departmentId?: string,
): Promise<ManagerEffectivenessReport> {
  const response = await apiClient.get<ManagerEffectivenessReport>(
    `reports/manager-effectiveness/${buildManagerEffectivenessQuery(cycleId, departmentId)}`,
  );
  return response.data;
}

// ---------------------------------------------------------------------------
// Competency Gap Report
// ---------------------------------------------------------------------------

/**
 * A single competency gap row returned by the competency-gaps endpoint.
 */
export interface CompetencyGapRow {
  competency_id: string;
  competency_name: string;
  avg_manager_rating: number;
  appraisal_count: number;
}

/**
 * Competency gap report response shape.
 */
export interface CompetencyGapReport {
  cycle_id: string | null;
  form_type: "FORM_A" | "FORM_B" | null;
  gaps: CompetencyGapRow[];
}

/**
 * Build a query string for the competency-gaps endpoint.
 * Supports optional cycle_id and form_type parameters.
 */
function buildCompetencyGapQuery(
  cycleId?: string,
  formType?: "FORM_A" | "FORM_B",
): string {
  const parts: string[] = [];
  if (cycleId) {
    parts.push(`cycle_id=${encodeURIComponent(cycleId)}`);
  }
  if (formType) {
    parts.push(`form_type=${encodeURIComponent(formType)}`);
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

/**
 * Fetch the competency gap report.
 * GET /api/v1/reports/competency-gaps/
 */
export async function getCompetencyGaps(
  cycleId?: string,
  formType?: "FORM_A" | "FORM_B",
): Promise<CompetencyGapReport> {
  const response = await apiClient.get<CompetencyGapReport>(
    `reports/competency-gaps/${buildCompetencyGapQuery(cycleId, formType)}`,
  );
  return response.data;
}

// ---------------------------------------------------------------------------
// Career Aspiration Pipeline
// ---------------------------------------------------------------------------

/**
 * A single aspired role row returned by the career pipeline endpoint.
 */
export interface AspirationRow {
  aspired_role: string;
  count: number;
  top_priority: "FIRST" | "SECOND" | "THIRD";
}

/**
 * Career aspiration pipeline report response shape.
 */
export interface CareerAspirationPipelineReport {
  cycle_id: string | null;
  aspired_roles: AspirationRow[];
}

/**
 * Fetch the career aspiration pipeline report.
 * GET /api/v1/reports/career-pipeline/
 */
export async function getCareerAspirationPipeline(
  cycleId?: string,
): Promise<CareerAspirationPipelineReport> {
  const response = await apiClient.get<CareerAspirationPipelineReport>(
    `reports/career-pipeline/${buildCycleQuery(cycleId)}`,
  );
  return response.data;
}

// ---------------------------------------------------------------------------
// Cross-Cycle Trend Report
// ---------------------------------------------------------------------------

/**
 * A single data point in the cross-cycle trend report.
 */
export interface TrendDataPoint {
  cycle_id: string;
  cycle_name: string;
  cycle_year: number;
  avg_total_score: number | null;
  appraisal_count: number;
}

/**
 * Cross-cycle trend report response shape.
 */
export interface CrossCycleTrendReport {
  department_id: string | null;
  data_points: TrendDataPoint[];
}

/**
 * Build a query string for the cross-cycle trend endpoint.
 * Supports optional department_id parameter.
 */
function buildTrendQuery(departmentId?: string): string {
  if (departmentId) {
    return `?department_id=${encodeURIComponent(departmentId)}`;
  }
  return "";
}

/**
 * Fetch the cross-cycle trend report.
 * GET /api/v1/reports/trend/
 */
export async function getCrossCycleTrend(
  departmentId?: string,
): Promise<CrossCycleTrendReport> {
  const response = await apiClient.get<CrossCycleTrendReport>(
    `reports/trend/${buildTrendQuery(departmentId)}`,
  );
  return response.data;
}

// ---------------------------------------------------------------------------
// Audit Compliance PDF
// ---------------------------------------------------------------------------

/**
 * Download the audit compliance report as a PDF.
 * GET /api/v1/reports/audit-compliance/pdf/
 *
 * Requests a blob response, creates an object URL, and triggers a
 * programmatic download via a hidden anchor element. The object URL
 * is revoked immediately after the click to prevent memory leaks.
 */
export async function downloadAuditCompliancePdf(
  cycleId: string,
  filename: string = "audit-compliance.pdf",
): Promise<void> {
  const response = await apiClient.get<Blob>(
    `reports/audit-compliance/pdf/${buildCycleQuery(cycleId)}`,
    { responseType: "blob" },
  );

  const resolvedFilename = extractFilename(
    response.headers["content-disposition"] as string | undefined,
    filename,
  );

  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = resolvedFilename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Self vs Manager Rating Variance
// ---------------------------------------------------------------------------

/**
 * A single KD variance row in the self vs manager variance report.
 */
export interface KDVarianceRow {
  kd_title: string;
  avg_self_rating: number;
  avg_manager_rating: number;
  variance: number;
  count: number;
}

/**
 * A single competency variance row in the self vs manager variance report.
 */
export interface CompetencyVarianceRow {
  competency_name: string;
  is_core: boolean;
  avg_self_rating: number;
  avg_manager_rating: number;
  variance: number;
  count: number;
}

/**
 * Self vs Manager Rating Variance report response shape.
 */
export interface SelfVsManagerVarianceReport {
  cycle_id: string | null;
  self_rating_enabled: boolean;
  kd_variances: KDVarianceRow[];
  competency_variances: CompetencyVarianceRow[];
}

/**
 * Build a query string for the variance endpoint.
 * Supports optional cycle_id and department_id parameters.
 */
function buildVarianceQuery(
  cycleId?: string,
  departmentId?: string,
): string {
  const parts: string[] = [];
  if (cycleId) {
    parts.push(`cycle_id=${encodeURIComponent(cycleId)}`);
  }
  if (departmentId) {
    parts.push(`department_id=${encodeURIComponent(departmentId)}`);
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

/**
 * Fetch the self vs manager rating variance report.
 * GET /api/v1/reports/variance/
 */
export async function getSelfVsManagerVariance(
  cycleId?: string,
  departmentId?: string,
): Promise<SelfVsManagerVarianceReport> {
  const response = await apiClient.get<SelfVsManagerVarianceReport>(
    `reports/variance/${buildVarianceQuery(cycleId, departmentId)}`,
  );
  return response.data;
}

// ---------------------------------------------------------------------------
// Score Descriptor Configuration Audit
// ---------------------------------------------------------------------------

/**
 * A single descriptor band row (shared by snapshot and live bands).
 */
export interface DescriptorBand {
  sort_order: number;
  min_score: string;
  max_score: string;
  kd_label: string;
  competency_label: string;
}

/**
 * Score descriptor configuration report response shape.
 */
export interface ScoreDescriptorConfigReport {
  cycle_id: string;
  cycle_name: string;
  cycle_status: string;
  config_snapshot_bands: DescriptorBand[];
  live_bands: DescriptorBand[];
}

/**
 * Fetch the score descriptor configuration audit report.
 * GET /api/v1/reports/descriptor-config/?cycle_id={cycleId}
 *
 * NOTE: cycle_id is required for this endpoint.
 */
export async function getScoreDescriptorConfig(
  cycleId: string,
): Promise<ScoreDescriptorConfigReport> {
  const response = await apiClient.get<ScoreDescriptorConfigReport>(
    `reports/descriptor-config/?cycle_id=${encodeURIComponent(cycleId)}`,
  );
  return response.data;
}

// ---------------------------------------------------------------------------
// Employee Appraisal History
// ---------------------------------------------------------------------------

/**
 * A single row in the employee appraisal history report.
 */
export interface AppraisalHistoryRow {
  cycle_id: string;
  cycle_name: string;
  cycle_year: number;
  cycle_status: string;
  total_score: number | null;
  kd_average_score: number | null;
  bc_average_score: number | null;
  performance_descriptor: string | null;
  kd_descriptor: string | null;
  bc_descriptor: string | null;
  appraisal_status: string;
  appraisal_id: string;
}

/**
 * Employee appraisal history response shape.
 */
export interface EmployeeAppraisalHistory {
  employee_id: string;
  employee_name: string;
  history: AppraisalHistoryRow[];
}

/**
 * Fetch the appraisal history for a specific employee.
 * GET /api/v1/reports/employees/{employeeId}/appraisal-history/
 */
export async function getEmployeeAppraisalHistory(
  employeeId: string,
): Promise<EmployeeAppraisalHistory> {
  const response = await apiClient.get<EmployeeAppraisalHistory>(
    `reports/employees/${employeeId}/appraisal-history/`,
  );
  return response.data;
}
