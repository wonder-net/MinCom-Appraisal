/**
 * extractCorrelationId — Extracts a correlation ID from an Axios error response.
 *
 * Checks both top-level and nested data.correlation_id paths.
 */

import { isAxiosError } from "axios";

export function extractCorrelationId(err: unknown): string | undefined {
  if (
    isAxiosError(err) &&
    err.response?.data &&
    typeof err.response.data === "object"
  ) {
    const data = err.response.data as Record<string, unknown>;
    if (typeof data.correlation_id === "string") return data.correlation_id;
    if (
      data.data &&
      typeof data.data === "object" &&
      typeof (data.data as Record<string, unknown>).correlation_id === "string"
    ) {
      return (data.data as Record<string, unknown>).correlation_id as string;
    }
  }
  return undefined;
}

/**
 * extractDetail — Extracts a user-facing detail message from an Axios error.
 */
export function extractDetail(err: unknown): string {
  if (
    isAxiosError(err) &&
    err.response?.data &&
    typeof err.response.data === "object"
  ) {
    const data = err.response.data as Record<string, unknown>;
    if (typeof data.detail === "string") return data.detail;
    if (data.data && typeof data.data === "object") {
      const nested = data.data as Record<string, unknown>;
      if (typeof nested.detail === "string") return nested.detail;
      if (typeof nested.message === "string") return nested.message;
    }
  }
  return "An unexpected error occurred.";
}
