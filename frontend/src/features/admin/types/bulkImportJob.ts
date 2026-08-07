/**
 * Type definitions for the async bulk-import job pipeline (TASK-304).
 *
 * Mirrors the backend response envelope for:
 *   - POST   /api/v1/admin/users/bulk-import/jobs/
 *   - GET    /api/v1/admin/users/bulk-import/jobs/<id>/
 *   - POST   /api/v1/admin/users/bulk-import/jobs/<id>/commit/
 *   - GET    /api/v1/admin/users/bulk-import/jobs/<id>/failed-rows.csv/
 *
 * The `validation_preview` shape reuses the existing sync-import row
 * shapes (`BulkImportRowPreview`) so the existing preview UI keeps working.
 */

import type { BulkImportRowPreview } from "@/api/admin-users";

/** Lifecycle states emitted by the backend job model. */
export type BulkImportJobStatus =
  | "PENDING_VALIDATION"
  | "VALIDATED"
  | "VALIDATION_FAILED"
  | "COMMITTING"
  | "SUCCEEDED"
  | "PARTIAL_SUCCESS"
  | "FAILED";

/** Terminal states — polling stops once the job reaches one of these. */
export const TERMINAL_STATUSES: readonly BulkImportJobStatus[] = [
  "SUCCEEDED",
  "PARTIAL_SUCCESS",
  "FAILED",
  "VALIDATION_FAILED",
] as const;

/** Validation preview returned once the job reaches `VALIDATED`. */
export interface ValidationPreview {
  valid_rows: BulkImportRowPreview[];
  error_rows: BulkImportRowPreview[];
  new_departments: string[];
}

/** A single failed row from the commit phase, surfaced on PARTIAL_SUCCESS. */
export interface FailedRow {
  row_number: number;
  employee_number: string;
  email: string;
  error: string;
}

/** The job actor (admin who initiated the import). */
export interface BulkImportJobActor {
  id: string;
  email: string;
  full_name: string;
}

/** Full job snapshot returned by the create/detail/commit endpoints. */
export interface BulkImportJob {
  id: string;
  status: BulkImportJobStatus;
  total_rows: number | null;
  processed_rows: number;
  created_count: number;
  failed_count: number;
  validation_preview: ValidationPreview | null;
  failed_rows: FailedRow[] | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  validation_completed_at: string | null;
  commit_started_at: string | null;
  commit_completed_at: string | null;
  created_by: BulkImportJobActor;
}

/** True when the job has reached a final state and should stop polling. */
export function isTerminalStatus(status: BulkImportJobStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** True when the job is in a state where the dialog should poll for updates. */
export function isInFlight(status: BulkImportJobStatus): boolean {
  return status === "PENDING_VALIDATION" || status === "COMMITTING";
}
