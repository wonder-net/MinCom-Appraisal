/**
 * Settings API functions for the MINCOM Appraisal Platform.
 *
 * Uses the main apiClient (with interceptors) for endpoints that
 * only need the standard JWT injection, avoiding the circular
 * dependency that would occur if apiClient were imported into auth-api.ts.
 */

import { apiClient } from "./client";
import type { MfaStatusResponse } from "./auth-api";

/**
 * Fetch the current user's MFA status.
 * Uses apiClient because this is a standard authenticated GET request
 * that benefits from automatic token injection and refresh handling.
 */
export async function getMfaStatus(): Promise<MfaStatusResponse> {
  const response = await apiClient.get<MfaStatusResponse>("auth/mfa/status/");
  return response.data;
}
