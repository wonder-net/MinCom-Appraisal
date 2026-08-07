/**
 * Typed API wrappers for the async bulk-import job endpoints (TASK-304).
 *
 * All calls route through the centralised `apiClient` so JWT injection,
 * 401 refresh, and the StandardResponseRenderer envelope unwrap are
 * handled consistently with the rest of the app.
 */

import { apiClient } from "@/api/client";
import type { BulkImportJob } from "../types/bulkImportJob";

const JOBS_BASE = "admin/users/bulk-import/jobs/";

/**
 * Upload a CSV/XLSX file and start a new async bulk-import job.
 * Returns the freshly-created job (status `PENDING_VALIDATION`).
 */
export async function createBulkImportJob(file: File): Promise<BulkImportJob> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiClient.post<BulkImportJob>(JOBS_BASE, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

/** Fetch the latest snapshot for an in-flight or terminal job. */
export async function getBulkImportJob(jobId: string): Promise<BulkImportJob> {
  const response = await apiClient.get<BulkImportJob>(`${JOBS_BASE}${jobId}/`);
  return response.data;
}

/**
 * Trigger the commit phase for a job that has reached `VALIDATED`.
 * Returns the job with status transitioned to `COMMITTING`.
 */
export async function commitBulkImportJob(jobId: string): Promise<BulkImportJob> {
  const response = await apiClient.post<BulkImportJob>(
    `${JOBS_BASE}${jobId}/commit/`,
  );
  return response.data;
}

/**
 * Build the authenticated URL for the failed-rows CSV download. The
 * caller hands this to `window.open` (the apiClient request interceptor
 * cannot inject the token onto a window-level navigation, so failed-row
 * downloads rely on the same-session cookie flow used by the
 * existing template-download buttons).
 */
export function failedRowsCsvUrl(jobId: string): string {
  // Handed straight to window.open() (see docblock above), so — unlike
  // apiClient-routed calls — this needs the base-path prefix baked in
  // manually. See src/api/client.ts for why this isn't a hardcoded
  // "/api/v1/".
  return `${import.meta.env.BASE_URL}api/v1/${JOBS_BASE}${jobId}/failed-rows.csv/`;
}

/**
 * Download the failed-rows CSV as a Blob via the authenticated apiClient.
 * Triggers a browser download by creating a transient object URL.
 */
export async function downloadFailedRowsCsv(jobId: string): Promise<void> {
  const response = await apiClient.get<Blob>(
    `${JOBS_BASE}${jobId}/failed-rows.csv/`,
    { responseType: "blob" },
  );
  const blob = response.data;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bulk-import-${jobId}-failed-rows.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
