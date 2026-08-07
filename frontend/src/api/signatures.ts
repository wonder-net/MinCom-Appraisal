/**
 * API service functions for appraisal sign-off endpoints.
 *
 * All functions use the centralised apiClient with JWT interceptors.
 * The response interceptor automatically unwraps the standard
 * { status, data, meta } envelope.
 */

import { apiClient } from "./client";
import type {
  SubmitSignatureRequest,
  SubmitSignatureResponse,
} from "@/types";

/**
 * Submit a sign-off signature (ACCEPT or REJECT) for an appraisal.
 * POST /api/v1/appraisals/:appraisalId/sign/
 */
export async function submitSignature(
  appraisalId: string,
  action: "ACCEPT" | "REJECT",
  reason?: string,
): Promise<SubmitSignatureResponse> {
  const body: SubmitSignatureRequest = { action };
  if (action === "REJECT" && reason) {
    body.reason = reason;
  }
  const response = await apiClient.post<SubmitSignatureResponse>(
    `appraisals/${appraisalId}/sign/`,
    body,
  );
  return response.data;
}
