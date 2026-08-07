/**
 * API service functions for admin user management endpoints.
 *
 * All functions use the centralised apiClient with JWT interceptors.
 * The response interceptor automatically unwraps the standard
 * { status, data, meta } envelope.
 */

import { isAxiosError } from "axios";
import { apiClient } from "./client";
import type {
  PaginatedResponse,
  AdminUser,
  CreateUserPayload,
  UpdateUserPayload,
} from "@/types";

/**
 * List all users with pagination and optional search.
 * GET /api/v1/admin/users/?page={page}&search={term}
 *
 * Accepts either a page number or a full URL (for next/previous navigation).
 * When a search term is provided, it is appended as a query parameter.
 */
export async function listUsers(
  pageOrUrl?: number | string,
  search?: string,
): Promise<PaginatedResponse<AdminUser[]>> {
  if (typeof pageOrUrl === "string") {
    // Full URL from next/previous — extract path relative to baseURL
    const url = new URL(pageOrUrl, window.location.origin);
    if (search?.trim()) {
      url.searchParams.set("search", search.trim());
    } else {
      url.searchParams.delete("search");
    }
    // Strip apiClient's own baseURL prefix (base-path-aware — see
    // src/api/client.ts — not a hardcoded "/api/v1/", since this app is
    // served off-root in some deployments).
    const apiPrefix = `${import.meta.env.BASE_URL}api/v1/`;
    const path = url.pathname.replace(new RegExp(`^${apiPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "") + url.search;
    const response = await apiClient.get<AdminUser[]>(path);
    return { data: response.data, meta: response.meta };
  }

  const params: Record<string, string | number> = {};
  if (pageOrUrl) params.page = pageOrUrl;
  if (search?.trim()) params.search = search.trim();
  const response = await apiClient.get<AdminUser[]>(
    "admin/users/",
    { params: Object.keys(params).length > 0 ? params : undefined },
  );
  return { data: response.data, meta: response.meta };
}

/**
 * List active Executive users — populates the escalation/re-assign picker.
 * GET /api/v1/admin/users/?role=EXECUTIVE&is_active=true
 *
 * The backend filters server-side; we request a large page_size so the
 * full set of active Executives is returned in a single call (there are
 * never enough Executives in MINCOM to require client-side pagination
 * for this picker — the page_size=100 cap is enforced server-side).
 */
export async function listExecutiveUsers(): Promise<AdminUser[]> {
  const response = await apiClient.get<AdminUser[]>("admin/users/", {
    params: {
      role: "EXECUTIVE",
      is_active: "true",
      page_size: 100,
    },
  });
  return response.data;
}

/**
 * Create a new user account.
 * POST /api/v1/admin/users/
 */
export async function createUser(
  data: CreateUserPayload,
): Promise<AdminUser> {
  const response = await apiClient.post<AdminUser>(
    "admin/users/",
    data,
  );
  return response.data;
}

/**
 * Update an existing user account.
 * PATCH /api/v1/admin/users/{id}/
 */
export async function updateUser(
  id: string,
  data: UpdateUserPayload,
): Promise<AdminUser> {
  const response = await apiClient.patch<AdminUser>(
    `admin/users/${id}/`,
    data,
  );
  return response.data;
}

// ---------------------------------------------------------------------------
// Bulk import API functions (TASK-146)
// ---------------------------------------------------------------------------

export interface BulkImportRowPreview {
  row_number: number;
  employee_number: string;
  full_name: string;
  email: string;
  status: "valid" | "error";
  error: string;
}

export interface BulkImportPreview {
  import_id: string;
  valid_rows: BulkImportRowPreview[];
  error_rows: BulkImportRowPreview[];
  new_departments: string[];
  total: number;
  valid_count: number;
  error_count: number;
}

export interface BulkImportFailedRow {
  row_number: number;
  employee_number: string;
  email: string;
  error: string;
}

export interface BulkImportResult {
  id: string;
  status: string;
  total_rows: number;
  created_count: number;
  failed_count: number;
  failed_rows: BulkImportFailedRow[];
  created_at: string;
  completed_at: string | null;
}

/** Upload and validate a .xlsx file for bulk employee import (Step 1). */
export async function bulkImportValidate(
  file: File,
): Promise<BulkImportPreview> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiClient.post<BulkImportPreview>(
    "admin/users/bulk-import/validate/",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return response.data;
}

/** Confirm and execute a validated bulk import (Step 2). */
export async function bulkImportConfirm(
  importId: string,
): Promise<{ import_id: string; status: string }> {
  const response = await apiClient.post<{ import_id: string; status: string }>(
    `admin/users/bulk-import/${importId}/confirm/`,
  );
  return response.data;
}

/** Get results of a completed bulk import job. */
export async function getBulkImportResults(
  importId: string,
): Promise<BulkImportResult> {
  const response = await apiClient.get<BulkImportResult>(
    `admin/users/bulk-import/${importId}/results/`,
  );
  return response.data;
}

/** Download the bulk import .xlsx template via authenticated API call. */
export async function downloadBulkImportTemplate(): Promise<Blob> {
  const response = await apiClient.get<Blob>(
    "admin/users/bulk-import/template/",
    { responseType: "blob" },
  );
  return response.data;
}

/** Download the bulk import .csv template via authenticated API call. */
export async function downloadBulkImportCsvTemplate(): Promise<Blob> {
  const response = await apiClient.get<Blob>(
    "admin/users/bulk-import/template/csv/",
    { responseType: "blob" },
  );
  return response.data;
}

// ---------------------------------------------------------------------------
// Resend invitation API function (TASK-180)
// ---------------------------------------------------------------------------

/** Error code thrown when a resend invitation call returns 409 Conflict. */
export const INVITATION_ALREADY_USED = "INVITATION_ALREADY_USED" as const;

/**
 * Typed error for distinguishing a 409 from other failures.
 *
 * Subclasses `Error` so it integrates with stack traces, logging
 * frameworks, and `instanceof` checks. Consistent with `ResetMFAError`
 * and `UnlockUserError` in this module.
 */
export class ResendInvitationError extends Error {
  readonly code: typeof INVITATION_ALREADY_USED;
  constructor() {
    super(`Resend invitation failed: ${INVITATION_ALREADY_USED}`);
    this.name = "ResendInvitationError";
    this.code = INVITATION_ALREADY_USED;
  }
}

/**
 * Resend an invitation email to a user who has not yet set their password.
 * POST /api/v1/admin/users/{id}/resend-invitation/
 *
 * Throws a `ResendInvitationError` on 409 (user already changed password).
 */
export async function resendInvitation(id: string): Promise<void> {
  try {
    await apiClient.post(`admin/users/${id}/resend-invitation/`);
  } catch (err: unknown) {
    if (isAxiosError(err) && err.response?.status === 409) {
      throw new ResendInvitationError();
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Reset MFA API function (TASK-256)
// ---------------------------------------------------------------------------

/** Error codes returned by the reset-MFA endpoint on 400 Bad Request. */
export const RESET_MFA_ERROR_CODES = [
  "INVALID_PASSWORD",
  "MFA_NOT_ENABLED",
  "SELF_RESET_NOT_ALLOWED",
] as const;

export type ResetMFAErrorCode = (typeof RESET_MFA_ERROR_CODES)[number];

/**
 * Typed error thrown by `resetUserMFA` when the backend returns 400.
 * The `code` field discriminates on the server-supplied error reason.
 *
 * Subclasses `Error` so it integrates with stack traces, logging
 * frameworks, and `instanceof` checks. The `isResetMFAError` type guard
 * stays structural so test mocks can still throw plain `{ code }` objects.
 */
export class ResetMFAError extends Error {
  readonly code: ResetMFAErrorCode;
  constructor(code: ResetMFAErrorCode) {
    super(`Reset MFA failed: ${code}`);
    this.name = "ResetMFAError";
    this.code = code;
  }
}

/**
 * Type guard for narrowing an unknown error to a `ResetMFAError`.
 * Structural check — accepts both `ResetMFAError` instances and plain
 * `{ code }` objects (the latter used by test mocks).
 */
export function isResetMFAError(err: unknown): err is ResetMFAError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    (RESET_MFA_ERROR_CODES as readonly string[]).includes(
      (err as { code: string }).code,
    )
  );
}

/**
 * Reset a user's MFA enrollment. HR_ADMIN-only.
 * POST /api/v1/admin/users/{id}/reset-mfa/
 *
 * The admin must re-enter their own password as a confirmation step.
 * On 400, throws a `ResetMFAError` whose `code` matches the server-supplied
 * error code (`INVALID_PASSWORD`, `MFA_NOT_ENABLED`, or `SELF_RESET_NOT_ALLOWED`).
 * Other errors are rethrown as-is.
 */
export async function resetUserMFA(
  userId: string,
  adminPassword: string,
): Promise<void> {
  try {
    await apiClient.post(`admin/users/${userId}/reset-mfa/`, {
      password: adminPassword,
    });
  } catch (err: unknown) {
    if (isAxiosError(err) && err.response?.status === 400) {
      const body = err.response.data as
        | { data?: { code?: string } }
        | { code?: string }
        | undefined;
      // The envelope interceptor only unwraps successful 2xx responses, so
      // error bodies retain the full `{ status, data: {...} }` shape.
      const code =
        (body as { data?: { code?: string } } | undefined)?.data?.code ??
        (body as { code?: string } | undefined)?.code;
      if (
        typeof code === "string" &&
        (RESET_MFA_ERROR_CODES as readonly string[]).includes(code)
      ) {
        throw new ResetMFAError(code as ResetMFAErrorCode);
      }
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Unlock account API function (TASK-262)
// ---------------------------------------------------------------------------

/** Error codes returned by the unlock-account endpoint on 400 Bad Request. */
export const UNLOCK_USER_ERROR_CODES = [
  "INVALID_PASSWORD",
  "NOT_LOCKED",
  "SELF_UNLOCK_NOT_ALLOWED",
] as const;

export type UnlockUserErrorCode = (typeof UNLOCK_USER_ERROR_CODES)[number];

/**
 * Typed error thrown by `unlockUser` when the backend returns 400.
 * The `code` field discriminates on the server-supplied error reason.
 *
 * Subclasses `Error` so it integrates with stack traces, logging
 * frameworks, and `instanceof` checks. The `isUnlockUserError` type guard
 * stays structural so test mocks can still throw plain `{ code }` objects.
 */
export class UnlockUserError extends Error {
  readonly code: UnlockUserErrorCode;
  constructor(code: UnlockUserErrorCode) {
    super(`Unlock user failed: ${code}`);
    this.name = "UnlockUserError";
    this.code = code;
  }
}

/**
 * Type guard for narrowing an unknown error to an `UnlockUserError`.
 * Structural check — accepts both `UnlockUserError` instances and plain
 * `{ code }` objects (the latter used by test mocks).
 */
export function isUnlockUserError(err: unknown): err is UnlockUserError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    (UNLOCK_USER_ERROR_CODES as readonly string[]).includes(
      (err as { code: string }).code,
    )
  );
}

/**
 * Unlock a user's account after a brute-force lockout. HR_ADMIN-only.
 * POST /api/v1/admin/users/{id}/unlock/
 *
 * The admin must re-enter their own password as a confirmation step.
 * On 400, throws an `UnlockUserError` whose `code` matches the server-supplied
 * error code (`INVALID_PASSWORD`, `NOT_LOCKED`, or `SELF_UNLOCK_NOT_ALLOWED`).
 * Other errors are rethrown as-is.
 */
export async function unlockUser(
  userId: string,
  adminPassword: string,
): Promise<void> {
  try {
    await apiClient.post(`admin/users/${userId}/unlock/`, {
      password: adminPassword,
    });
  } catch (err: unknown) {
    if (isAxiosError(err) && err.response?.status === 400) {
      const body = err.response.data as
        | { data?: { code?: string } }
        | { code?: string }
        | undefined;
      // The envelope interceptor only unwraps successful 2xx responses, so
      // error bodies retain the full `{ status, data: {...} }` shape.
      const code =
        (body as { data?: { code?: string } } | undefined)?.data?.code ??
        (body as { code?: string } | undefined)?.code;
      if (
        typeof code === "string" &&
        (UNLOCK_USER_ERROR_CODES as readonly string[]).includes(code)
      ) {
        throw new UnlockUserError(code as UnlockUserErrorCode);
      }
    }
    throw err;
  }
}
