/**
 * API service functions for the admin competencies endpoint.
 *
 * All functions use the centralised apiClient with JWT interceptors.
 * The response interceptor automatically unwraps the standard
 * { status, data, meta } envelope.
 */

import { apiClient } from "./client";

/**
 * Category values returned by the competencies endpoint.
 */
export type CompetencyCategory = "ALL" | "MANAGERIAL" | "NON_MANAGERIAL";

/**
 * Competency record returned by the admin competencies endpoint.
 *
 * `category` is retained for backwards compatibility. `applicable_to` is the
 * authoritative field going forward (TASK-265 exposed it in the read
 * serializer alongside `is_core` and `sort_order`).
 */
export interface Competency {
  id: string;
  name: string;
  category: CompetencyCategory;
  applicable_to: CompetencyCategory;
  is_core: boolean;
  sort_order: number;
  is_active: boolean;
}

/**
 * Payload for creating a new competency.
 */
export interface CreateCompetencyPayload {
  name: string;
  category: string;
}

/**
 * List all competencies.
 * GET /api/v1/admin/competencies/
 */
export async function listAdminCompetencies(): Promise<Competency[]> {
  const response = await apiClient.get<Competency[]>(
    "admin/competencies/",
    { params: { include_inactive: "true" } },
  );
  return response.data;
}

/**
 * Create a new competency.
 * POST /api/v1/admin/competencies/
 */
export async function createCompetency(
  payload: CreateCompetencyPayload,
): Promise<Competency> {
  const response = await apiClient.post<Competency>(
    "admin/competencies/",
    payload,
  );
  return response.data;
}

/**
 * Payload for partially updating a competency.
 *
 * Only `applicable_to`, `is_core`, `sort_order`, and `is_active` may be sent.
 * `name` and `category` are immutable on the backend (returns 400 if included).
 */
export interface PatchCompetencyPayload {
  applicable_to?: CompetencyCategory;
  is_core?: boolean;
  sort_order?: number;
  is_active?: boolean;
}

/**
 * Partially update a competency.
 * PATCH /api/v1/admin/competencies/:id/
 */
export async function patchCompetency(
  id: string,
  payload: PatchCompetencyPayload,
): Promise<Competency> {
  const response = await apiClient.patch<Competency>(
    `admin/competencies/${id}/`,
    payload,
  );
  return response.data;
}
