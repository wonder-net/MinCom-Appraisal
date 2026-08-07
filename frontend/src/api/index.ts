/**
 * API service layer for the MINCOM Appraisal Platform.
 *
 * This module is the single entry point for all API communication.
 * It re-exports the configured Axios client and auth-specific API
 * functions that use a separate, unintercepted Axios instance.
 *
 * Components should NEVER import Axios directly -- always import
 * from this module or its sub-modules.
 */

export { apiClient } from "./client";
export {
  loginApi,
  refreshTokenApi,
  logoutApi,
  verifyMFAApi,
  changePasswordApi,
  mfaSetupApi,
  mfaSetupConfirmApi,
  disableMfaApi,
  regenerateRecoveryCodesApi,
  requestPasswordReset,
  confirmPasswordReset,
} from "./auth-api";
export type {
  LoginApiResponse,
  MfaVerifyApiResponse,
  RefreshApiResponse,
  MfaSetupResponse,
  MfaSetupConfirmResponse,
  MfaStatusResponse,
  RegenerateRecoveryCodesResponse,
} from "./auth-api";
export { getMfaStatus } from "./settings";
export {
  listAppraisals,
  getAppraisal,
  listDeliverables,
  createDeliverable,
  updateDeliverable,
  deleteDeliverable,
  listCompetencies,
  updateCompetencyRating,
  transitionAppraisal,
  listCycles,
  excludeAppraisal,
  reincludeAppraisal,
  importExcel,
  downloadAppraisalPDF,
} from "./appraisals";
export type { ImportSummary } from "./appraisals";
export { listComments, createComment } from "./comments";
export { submitSignature } from "./signatures";
export { getGrowthPlan, createGrowthPlan, updateGrowthPlan } from "./growth-plans";
export { listUsers, createUser, updateUser } from "./admin-users";
export { getDashboardReport, getDepartmentReport, getTrainingNeeds } from "./reports";
export type { TrainingNeedGroup, RecommendedCourse, TrainingNeedsReport } from "./reports";
export { listAdminCompetencies, createCompetency } from "./competencies";
export type { Competency, CreateCompetencyPayload } from "./competencies";
export { listEmployees, getEmployee, getDirectReports } from "./employees";
export type { Employee, EmployeeListParams } from "./employees";
export { listAuditLogs } from "./audit";
export type { AuditLogEntry, AuditLogParams, CursorPaginatedAuditLogs } from "./audit";
export { getUnreadCount, listNotifications, markRead, markAllRead } from "./notifications";
