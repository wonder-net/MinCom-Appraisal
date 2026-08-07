/**
 * API service functions for growth plan endpoints.
 *
 * All functions use the centralised apiClient with JWT interceptors.
 * The response interceptor automatically unwraps the standard
 * { status, data, meta } envelope.
 */

import { apiClient } from "./client";
import type { GrowthPlan, GrowthPlanPayload } from "@/types";

/**
 * Fetch the growth plan for an appraisal, or null if none exists.
 * GET /api/v1/appraisals/:appraisalId/growth-plan/
 */
export async function getGrowthPlan(
  appraisalId: string,
): Promise<GrowthPlan | null> {
  try {
    const response = await apiClient.get<GrowthPlan>(
      `appraisals/${appraisalId}/growth-plan/`,
    );
    return response.data;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } }).response?.status;
    if (status === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Create a new growth plan for an appraisal.
 * POST /api/v1/appraisals/:appraisalId/growth-plan/
 */
export async function createGrowthPlan(
  appraisalId: string,
  data: GrowthPlanPayload,
): Promise<GrowthPlan> {
  const response = await apiClient.post<GrowthPlan>(
    `appraisals/${appraisalId}/growth-plan/`,
    data,
  );
  return response.data;
}

/**
 * Update an existing growth plan for an appraisal.
 * PATCH /api/v1/appraisals/:appraisalId/growth-plan/
 */
export async function updateGrowthPlan(
  appraisalId: string,
  data: Partial<GrowthPlanPayload>,
): Promise<GrowthPlan> {
  const response = await apiClient.patch<GrowthPlan>(
    `appraisals/${appraisalId}/growth-plan/`,
    data,
  );
  return response.data;
}
