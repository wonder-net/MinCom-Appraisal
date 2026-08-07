/**
 * API service functions for audit log endpoints.
 *
 * All functions use the centralised apiClient with JWT interceptors.
 * The response interceptor automatically unwraps the standard
 * { status, data, meta } envelope.
 */

import { apiClient } from "./client";

/**
 * A single audit log entry returned by the API.
 */
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  old_value_hash: string | null;
  new_value_hash: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
}

/**
 * Cursor-paginated audit log response shape.
 */
export interface CursorPaginatedAuditLogs {
  results: AuditLogEntry[];
  next: string | null;
  previous: string | null;
}

/**
 * Optional query params accepted by the audit log list endpoint.
 */
export interface AuditLogParams {
  cursor?: string;
  resource_type?: string;
  action?: string;
  timestamp__gte?: string;
  timestamp__lte?: string;
}

/**
 * Extracts the cursor token from a full pagination URL.
 * The backend returns `pagination.next` as a full URL like
 * `http://host/api/v1/audit/logs/?cursor=cD0yMDI...`.
 * We need just the `cursor` query-param value.
 */
function extractCursorToken(cursorOrUrl: string): string {
  try {
    const url = new URL(cursorOrUrl);
    return url.searchParams.get("cursor") ?? cursorOrUrl;
  } catch {
    return cursorOrUrl;
  }
}

/**
 * List audit log entries with optional cursor pagination and filters.
 * GET /api/v1/audit/logs/
 */
export async function listAuditLogs(
  filterParams?: AuditLogParams,
): Promise<CursorPaginatedAuditLogs> {
  const params: Record<string, string> = {};

  if (filterParams?.cursor) {
    params.cursor = extractCursorToken(filterParams.cursor);
  }
  if (filterParams?.resource_type) {
    params.resource_type = filterParams.resource_type;
  }
  if (filterParams?.action) {
    params.action = filterParams.action;
  }
  if (filterParams?.timestamp__gte) {
    params.timestamp__gte = filterParams.timestamp__gte;
  }
  if (filterParams?.timestamp__lte) {
    params.timestamp__lte = filterParams.timestamp__lte;
  }

  const response = await apiClient.get<AuditLogEntry[]>("audit/logs/", {
    params,
  });

  const pagination = response.meta?.pagination;
  return {
    results: response.data,
    next: pagination?.next ?? null,
    previous: pagination?.previous ?? null,
  };
}

