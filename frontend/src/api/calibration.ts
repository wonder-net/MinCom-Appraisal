/**
 * API service functions for calibration endpoints (product roadmap
 * item, not one of the 11 original HR change requests — see the
 * "9-box first, calibration second" roadmap conversation, and the
 * backend's CalibrationSession entity docblock for the full picture).
 *
 * Unlike every other report in reports.ts, these are deliberately NOT
 * cached server-side — see CalibrationBoardController's docblock — so
 * there's nothing special needed here either; every call hits the
 * live endpoint.
 */

import { apiClient } from "./client";

/**
 * Build a query string with an optional cycle_id parameter — mirrors
 * reports.ts's buildCycleQuery() for consistency.
 */
function buildCycleQuery(cycleId?: string): string {
  return cycleId ? `?cycle_id=${encodeURIComponent(cycleId)}` : "";
}

export type CalibrationSessionStatus = "PENDING" | "COMPLETE";

export interface CalibrationDepartmentSummary {
  department_id: string;
  department_name: string;
  signed_off_count: number;
  finalised_count: number;
  status: CalibrationSessionStatus;
  completed_by_name: string | null;
  completed_at: string | null;
}

export interface CalibrationOverview {
  cycle_id: string | null;
  departments: CalibrationDepartmentSummary[];
}

export interface CalibrationAppraisalRow {
  appraisal_id: string;
  employee_id: string;
  employee_number: string;
  employee_name: string;
  manager_name: string | null;
  status: "SIGNED_OFF" | "FINALISED";
  kd_average_score: string | null;
  bc_average_score: string | null;
  total_score: string | null;
  performance_descriptor: string | null;
}

export interface CalibrationBoard {
  cycle_id: string;
  department_id: string;
  department_name: string;
  status: CalibrationSessionStatus;
  completed_by_name: string | null;
  completed_at: string | null;
  notes: string | null;
  appraisals: CalibrationAppraisalRow[];
}

/**
 * Fetch the calibration overview (one row per department with
 * calibration-ready appraisals).
 * GET /api/v1/calibration/overview/
 */
export async function getCalibrationOverview(cycleId?: string): Promise<CalibrationOverview> {
  const response = await apiClient.get<CalibrationOverview>(`calibration/overview/${buildCycleQuery(cycleId)}`);
  return response.data;
}

/**
 * Fetch the calibration board for one department in a cycle.
 * GET /api/v1/calibration/board/
 */
export async function getCalibrationBoard(cycleId: string, departmentId: string): Promise<CalibrationBoard> {
  const response = await apiClient.get<CalibrationBoard>(
    `calibration/board/?cycle_id=${encodeURIComponent(cycleId)}&department_id=${encodeURIComponent(departmentId)}`,
  );
  return response.data;
}

/**
 * Mark a department's calibration COMPLETE for a cycle — this is what
 * unlocks FINALISED for every SIGNED_OFF appraisal in it. HR Admin/
 * System Admin only.
 * POST /api/v1/calibration/complete/
 */
export async function completeCalibration(
  cycleId: string,
  departmentId: string,
  notes?: string,
): Promise<CalibrationBoard> {
  const response = await apiClient.post<CalibrationBoard>("calibration/complete/", {
    cycle_id: cycleId,
    department_id: departmentId,
    notes,
  });
  return response.data;
}

/**
 * Reverse completeCalibration() — re-locks finalization for the
 * department. Does not revert any appraisal already FINALISED off the
 * back of the now-reopened session. HR Admin/System Admin only.
 * POST /api/v1/calibration/reopen/
 */
export async function reopenCalibration(cycleId: string, departmentId: string): Promise<CalibrationBoard> {
  const response = await apiClient.post<CalibrationBoard>("calibration/reopen/", {
    cycle_id: cycleId,
    department_id: departmentId,
  });
  return response.data;
}
