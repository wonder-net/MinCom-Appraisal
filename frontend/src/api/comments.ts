/**
 * API service functions for appraisal comment endpoints.
 *
 * All functions use the centralised apiClient with JWT interceptors.
 * The response interceptor automatically unwraps the standard
 * { status, data, meta } envelope.
 */

import { apiClient } from "./client";
import type { Comment, CreateCommentRequest } from "@/types";

/**
 * List all comments for an appraisal, ordered by created_at ascending.
 * GET /api/v1/appraisals/:appraisalId/comments/
 */
export async function listComments(
  appraisalId: string,
): Promise<Comment[]> {
  const response = await apiClient.get<Comment[]>(
    `appraisals/${appraisalId}/comments/`,
  );
  return response.data;
}

/**
 * Create a new comment on an appraisal.
 * POST /api/v1/appraisals/:appraisalId/comments/
 */
export async function createComment(
  appraisalId: string,
  body: CreateCommentRequest,
): Promise<Comment> {
  const response = await apiClient.post<Comment>(
    `appraisals/${appraisalId}/comments/`,
    body,
  );
  return response.data;
}
