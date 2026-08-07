/**
 * extractApiError — Extracts a user-friendly error message from an API error.
 *
 * Handles Axios error responses that follow the standard API error envelope:
 * { status: "error", data: { message: "..." } }
 *
 * Falls back to a generic message for unexpected error shapes.
 */

import { isAxiosError } from "axios";

const DEFAULT_MESSAGE = "An unexpected error occurred. Please try again.";

export function extractApiError(err: unknown): string {
  if (isAxiosError(err) && err.response?.data) {
    const data = err.response.data as { data?: { message?: string } };
    if (data.data?.message) {
      return data.data.message;
    }
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return DEFAULT_MESSAGE;
}
