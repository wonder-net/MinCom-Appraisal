/**
 * API service functions for appraisal endpoints.
 *
 * All functions use the centralised apiClient with JWT interceptors.
 * The response interceptor automatically unwraps the standard
 * { status, data, meta } envelope — callers receive the inner
 * payload directly.
 */

import { apiClient } from "./client";
import type {
  PaginatedResponse,
  Appraisal,
  KeyDeliverable,
  CompetencyRating,
  AppraisalListParams,
  TransitionRequest,
  CreateKeyDeliverableRequest,
  UpdateKeyDeliverableRequest,
  UpdateCompetencyRatingRequest,
  SubCompetencyRating,
  UpdateSubCompetencyRatingRequest,
  AppraisalCycle,
  CreateCyclePayload,
  UpdateCyclePayload,
} from "@/types";

/**
 * List appraisals with optional filters and pagination.
 * GET /api/v1/appraisals/
 */
export async function listAppraisals(
  params?: AppraisalListParams,
): Promise<PaginatedResponse<Appraisal[]>> {
  const response = await apiClient.get<Appraisal[]>(
    "appraisals/",
    { params },
  );
  return { data: response.data, meta: response.meta };
}

/**
 * Fetch a single appraisal by ID.
 * GET /api/v1/appraisals/:id/
 */
export async function getAppraisal(
  id: string,
): Promise<Appraisal> {
  const response = await apiClient.get<Appraisal>(
    `appraisals/${id}/`,
  );
  return response.data;
}

/**
 * List key deliverables for an appraisal.
 * GET /api/v1/appraisals/:id/deliverables/
 */
export async function listDeliverables(
  appraisalId: string,
): Promise<KeyDeliverable[]> {
  const response = await apiClient.get<KeyDeliverable[]>(
    `appraisals/${appraisalId}/deliverables/`,
  );
  return response.data;
}

/**
 * Create a key deliverable for an appraisal.
 * POST /api/v1/appraisals/:id/deliverables/
 */
export async function createDeliverable(
  appraisalId: string,
  body: CreateKeyDeliverableRequest,
): Promise<KeyDeliverable> {
  const response = await apiClient.post<KeyDeliverable>(
    `appraisals/${appraisalId}/deliverables/`,
    body,
  );
  return response.data;
}

/**
 * Update a key deliverable.
 * PATCH /api/v1/appraisals/:id/deliverables/:kdId/
 */
export async function updateDeliverable(
  appraisalId: string,
  kdId: string,
  body: UpdateKeyDeliverableRequest,
): Promise<KeyDeliverable> {
  const response = await apiClient.patch<KeyDeliverable>(
    `appraisals/${appraisalId}/deliverables/${kdId}/`,
    body,
  );
  return response.data;
}

/**
 * Delete a key deliverable.
 * DELETE /api/v1/appraisals/:id/deliverables/:kdId/
 */
export async function deleteDeliverable(
  appraisalId: string,
  kdId: string,
): Promise<void> {
  await apiClient.delete(`appraisals/${appraisalId}/deliverables/${kdId}/`);
}

/**
 * List competency ratings for an appraisal.
 * GET /api/v1/appraisals/:id/competencies/
 */
export async function listCompetencies(
  appraisalId: string,
): Promise<CompetencyRating[]> {
  const response = await apiClient.get<CompetencyRating[]>(
    `appraisals/${appraisalId}/competencies/`,
  );
  return response.data;
}

/**
 * Update a competency rating.
 * PATCH /api/v1/appraisals/:id/competencies/:crId/
 */
export async function updateCompetencyRating(
  appraisalId: string,
  crId: string,
  body: UpdateCompetencyRatingRequest,
): Promise<CompetencyRating> {
  const response = await apiClient.patch<CompetencyRating>(
    `appraisals/${appraisalId}/competencies/${crId}/`,
    body,
  );
  return response.data;
}

/**
 * Update one sub-competency's rating. Used instead of
 * updateCompetencyRating() whenever the core value has sub-competencies
 * (CompetencyRating.sub_competency_ratings is non-empty) — the parent
 * rating is then a read-only roll-up the server computes.
 * PATCH /api/v1/appraisals/:id/competencies/:crId/sub-competencies/:subCrId/
 */
export async function updateSubCompetencyRating(
  appraisalId: string,
  crId: string,
  subCrId: string,
  body: UpdateSubCompetencyRatingRequest,
): Promise<SubCompetencyRating> {
  const response = await apiClient.patch<SubCompetencyRating>(
    `appraisals/${appraisalId}/competencies/${crId}/sub-competencies/${subCrId}/`,
    body,
  );
  return response.data;
}

/**
 * Appraisee-only: add a sub-competency of their own under a core value
 * on their own appraisal (SELF_ASSESSMENT only) — per-appraisal only,
 * never written to HR's master sub-competency list. Reshares every
 * sibling's max_score and clears existing sub-ratings on that core
 * value, so the response is the full updated CompetencyRating.
 * POST /api/v1/appraisals/:id/competencies/:crId/sub-competencies/
 */
export async function addSubCompetency(
  appraisalId: string,
  crId: string,
  name: string,
): Promise<CompetencyRating> {
  const response = await apiClient.post<CompetencyRating>(
    `appraisals/${appraisalId}/competencies/${crId}/sub-competencies/`,
    { name },
  );
  return response.data;
}

/**
 * Trigger a workflow transition on an appraisal.
 * POST /api/v1/appraisals/:id/transition/
 */
export async function transitionAppraisal(
  appraisalId: string,
  body: TransitionRequest,
): Promise<Appraisal> {
  const response = await apiClient.post<Appraisal>(
    `appraisals/${appraisalId}/transition/`,
    body,
  );
  return response.data;
}

/**
 * List available appraisal cycles.
 * GET /api/v1/appraisals/cycles/
 */
export async function listCycles(): Promise<AppraisalCycle[]> {
  const response = await apiClient.get<AppraisalCycle[]>(
    "appraisals/cycles/",
  );
  return response.data;
}

/**
 * Create a new appraisal cycle.
 * POST /api/v1/appraisals/cycles/
 */
export async function createCycle(
  payload: CreateCyclePayload,
): Promise<AppraisalCycle> {
  const response = await apiClient.post<AppraisalCycle>(
    "appraisals/cycles/",
    payload,
  );
  return response.data;
}

/**
 * Update an existing appraisal cycle.
 * PATCH /api/v1/appraisals/cycles/{id}/
 */
export async function updateCycle(
  id: string,
  payload: UpdateCyclePayload,
): Promise<AppraisalCycle> {
  const response = await apiClient.patch<AppraisalCycle>(
    `appraisals/cycles/${id}/`,
    payload,
  );
  return response.data;
}

/**
 * Activate a DRAFT cycle, creating appraisals for all active employees.
 * POST /api/v1/appraisals/cycles/{id}/activate/
 */
export async function activateCycle(
  id: string,
): Promise<AppraisalCycle> {
  const response = await apiClient.post<AppraisalCycle>(
    `appraisals/cycles/${id}/activate/`,
  );
  return response.data;
}

/**
 * Close an ACTIVE cycle, preventing further submissions.
 * POST /api/v1/appraisals/cycles/{id}/close/
 */
export async function closeCycle(
  id: string,
): Promise<AppraisalCycle> {
  const response = await apiClient.post<AppraisalCycle>(
    `appraisals/cycles/${id}/close/`,
  );
  return response.data;
}

/**
 * Archive a CLOSED cycle, marking it as HR's permanent historical record.
 * POST /api/v1/appraisals/cycles/{id}/archive/
 */
export async function archiveCycle(
  id: string,
): Promise<AppraisalCycle> {
  const response = await apiClient.post<AppraisalCycle>(
    `appraisals/cycles/${id}/archive/`,
  );
  return response.data;
}

/**
 * Exclude an appraisal from the current cycle.
 * POST /api/v1/appraisals/{id}/exclude/
 */
export async function excludeAppraisal(
  id: string,
  data: { reason: string },
): Promise<void> {
  await apiClient.post(`appraisals/${id}/exclude/`, data);
}

/**
 * Re-include an excluded appraisal in the current cycle.
 * POST /api/v1/appraisals/{id}/reinclude/
 */
export async function reincludeAppraisal(id: string): Promise<void> {
  await apiClient.post(`appraisals/${id}/reinclude/`);
}

/**
 * Summary returned by the Excel import endpoint.
 */
export interface ImportSummary {
  kd_imported: number;
  competency_ratings_imported: number;
  growth_plan_imported: boolean;
  import_summary: Record<string, unknown>;
  errors?: string[];
}

/**
 * Import an Excel file into an appraisal.
 * POST /api/v1/appraisals/{id}/import-excel/ (multipart/form-data)
 */
export async function importExcel(
  id: string,
  file: File,
): Promise<ImportSummary> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiClient.post<ImportSummary>(
    `appraisals/${id}/import-excel/`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return response.data;
}

/**
 * Download the appraisal as a PDF blob.
 * GET /api/v1/appraisals/{id}/pdf/ (responseType: blob)
 *
 * NOTE: Blob responses skip the envelope unwrap interceptor.
 */
export async function downloadAppraisalPDF(id: string): Promise<Blob> {
  const response = await apiClient.get<Blob>(
    `appraisals/${id}/pdf/`,
    { responseType: "blob" },
  );
  return response.data;
}

// ---------------------------------------------------------------------------
// Executive escalation (TASK-268)
// ---------------------------------------------------------------------------

/**
 * Request body for POST /api/v1/appraisals/:id/escalate/.
 *
 * `reason` must be at least 10 characters (validated client-side and
 * enforced server-side). `version` is the appraisal's current
 * optimistic-locking version; a mismatch returns HTTP 409.
 */
export interface EscalateAppraisalPayload {
  executive_user_id: string;
  reason: string;
  version: number;
}

/**
 * Request body for POST /api/v1/appraisals/:id/reassign-executive/.
 *
 * Re-assignment does not accept a reason — the original escalation
 * reason is preserved server-side.
 */
export interface ReassignExecutivePayload {
  executive_user_id: string;
  version: number;
}

/**
 * Escalate a DISPUTED appraisal to an Executive. HR Admin only.
 * POST /api/v1/appraisals/:id/escalate/
 *
 * Returns the updated appraisal on success. The endpoint returns
 * HTTP 409 on optimistic-lock version mismatch and HTTP 400 on
 * validation errors (reason too short, target user not an active
 * Executive, etc.) — both are surfaced as thrown Axios errors here.
 */
export async function escalateAppraisal(
  id: string,
  payload: EscalateAppraisalPayload,
): Promise<Appraisal> {
  const response = await apiClient.post<Appraisal>(
    `appraisals/${id}/escalate/`,
    payload,
  );
  return response.data;
}

/**
 * Re-assign an already-escalated appraisal to a different Executive.
 * HR Admin only.
 * POST /api/v1/appraisals/:id/reassign-executive/
 *
 * The original escalation reason is preserved; no reason field is
 * accepted in the body. Same 409 / 400 semantics as `escalateAppraisal`.
 */
export async function reassignExecutive(
  id: string,
  payload: ReassignExecutivePayload,
): Promise<Appraisal> {
  const response = await apiClient.post<Appraisal>(
    `appraisals/${id}/reassign-executive/`,
    payload,
  );
  return response.data;
}

/** Bulk-finalise selected SIGNED_OFF appraisals. HR Admin only. */
export async function bulkFinalise(
  appraisalIds: string[],
): Promise<{ finalised: number; skipped: number }> {
  const response = await apiClient.post<{ finalised: number; skipped: number }>(
    "appraisals/bulk-finalise/",
    { appraisal_ids: appraisalIds },
  );
  return response.data;
}

/** Finalise all SIGNED_OFF appraisals in a cycle. HR Admin only. */
export async function finaliseAllInCycle(
  cycleId: string,
): Promise<{ finalised: number }> {
  const response = await apiClient.post<{ finalised: number }>(
    `appraisals/cycles/${cycleId}/finalise-all/`,
  );
  return response.data;
}

// ---------------------------------------------------------------------------
// Appraisal Bulk Import API (Sprint 08)
// ---------------------------------------------------------------------------

export interface AppraisalImportFilePreview {
  filename: string;
  form_type: string;
  extracted: {
    employee_name: string;
    department: string;
    job_title: string;
    location: string;
    employee_number: string;
  };
  match_status?: string;
  match_confidence?: number;
  matched_employee?: {
    id: string;
    employee_number: string;
    name: string;
  } | null;
  candidates?: {
    id: string;
    employee_number: string;
    name: string;
    department: string;
    score: number;
  }[];
  score_validation?: {
    document_kd_avg: string | null;
    calculated_kd_avg: string | null;
    document_bc_avg: string | null;
    calculated_bc_avg: string | null;
    document_total: string | null;
    calculated_total: string | null;
    has_discrepancy: boolean;
    discrepancy_details: string[];
  };
  data_summary: {
    kd_count: number;
    competency_count: number;
    comments_count: number;
    has_growth_plan: boolean;
  };
  errors: string[];
}

export interface AppraisalImportPreview {
  import_id: string;
  target_status: string;
  files: AppraisalImportFilePreview[];
  summary: {
    total_files: number;
    matched: number;
    suggested: number;
    unmatched: number;
    errors: number;
    score_discrepancies: number;
  };
}

export interface AppraisalImportResult {
  id: string;
  status: string;
  target_status: string;
  total_files: number;
  imported_count: number;
  failed_count: number;
  failed_files: { filename: string; error: string }[];
  created_at: string;
  completed_at: string | null;
}

/** Upload and validate .xls or .zip for bulk appraisal import (Step 1). */
export async function appraisalBulkImportValidate(
  file: File,
  cycleId: string,
  targetStatus: string,
): Promise<AppraisalImportPreview> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("cycle_id", cycleId);
  formData.append("target_status", targetStatus);
  const response = await apiClient.post<AppraisalImportPreview>(
    "appraisals/bulk-import/validate/",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return response.data;
}

/** Confirm and execute bulk appraisal import (Step 2). */
export async function appraisalBulkImportConfirm(
  importId: string,
  confirmedMatches: Record<string, string>,
): Promise<{ import_id: string; status: string }> {
  const response = await apiClient.post<{ import_id: string; status: string }>(
    `appraisals/bulk-import/${importId}/confirm/`,
    { confirmed_matches: confirmedMatches },
  );
  return response.data;
}

/** Get results of a completed bulk appraisal import. */
export async function getAppraisalImportResults(
  importId: string,
): Promise<AppraisalImportResult> {
  const response = await apiClient.get<AppraisalImportResult>(
    `appraisals/bulk-import/${importId}/results/`,
  );
  return response.data;
}
