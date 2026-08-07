/**
 * Utility functions for the authentication module.
 *
 * Contains JWT decoding, token expiry calculation, type guards,
 * and error message extraction. These are pure functions with no
 * side effects, extracted to keep the AuthProvider component lean.
 */

import type { LoginMfaResponse, LoginSuccessResponse, User, UserRole } from "./types";

/**
 * How many milliseconds before the access token expires to trigger
 * a proactive refresh. Set to 60 seconds (tokens have 15-min lifetime).
 */
export const REFRESH_MARGIN_MS = 60_000;

/**
 * Default lifetime for access tokens in milliseconds (15 minutes).
 * Used when we cannot parse the token's expiry claim.
 */
const DEFAULT_TOKEN_LIFETIME_MS = 15 * 60 * 1000;

/**
 * Decodes the payload of a JWT (base64url) without verifying signature.
 * Returns the parsed payload object or null on failure.
 */
function decodeTokenPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    if (!payload) return null;
    // base64url -> base64
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Returns the number of milliseconds until the given JWT expires.
 * Falls back to DEFAULT_TOKEN_LIFETIME_MS if the token cannot be parsed.
 */
export function getTokenExpiryMs(token: string): number {
  const payload = decodeTokenPayload(token);
  if (payload && typeof payload.exp === "number") {
    const expiresAt = payload.exp * 1000; // convert seconds to ms
    return Math.max(expiresAt - Date.now(), 0);
  }
  return DEFAULT_TOKEN_LIFETIME_MS;
}

/**
 * Type guard distinguishing a direct login success from an MFA challenge.
 */
export function isLoginSuccess(
  data: LoginSuccessResponse | LoginMfaResponse,
): data is LoginSuccessResponse {
  return "access" in data && "user" in data;
}

/** Generic fallback message for errors that don't match the API envelope. */
const GENERIC_ERROR_MESSAGE = "An unexpected error occurred. Please try again.";

/**
 * Extract a human-friendly error message from an unknown error.
 * Only trusts messages from the structured API response envelope.
 * Never falls through to raw Error.message to prevent leaking internals.
 */
export function extractErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error
  ) {
    const axiosError = error as {
      response?: {
        data?: {
          data?: { message?: string };
        };
      };
    };
    const message = axiosError.response?.data?.data?.message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return GENERIC_ERROR_MESSAGE;
}

/**
 * Extract the structured ``code`` field from an API error envelope.
 *
 * Returns the code string when present, or ``undefined`` otherwise.
 * Used by the auth flow to branch on specific server-returned codes
 * (e.g. ``NO_SPA_ROLES_ASSIGNED``) without relying on message strings.
 */
export function extractErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error
  ) {
    const axiosError = error as {
      response?: {
        data?: {
          data?: { code?: unknown };
        };
      };
    };
    const code = axiosError.response?.data?.data?.code;
    if (typeof code === "string" && code.length > 0) {
      return code;
    }
  }
  return undefined;
}

/**
 * Validates that a value is a valid UserRole string.
 */
function isValidRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" &&
    [
      "EMPLOYEE",
      "MANAGER",
      "HR_OFFICER",
      "HR_ADMIN",
      "SYSTEM_ADMIN",
      "EXECUTIVE",
    ].includes(value)
  );
}

/**
 * Decodes the JWT access token payload and extracts user data.
 * Returns null if the token cannot be parsed or does not contain
 * the required user fields.
 */
export function decodeUserFromToken(token: string): User | null {
  const payload = decodeTokenPayload(token);
  if (!payload) return null;

  const id = payload.user_id ?? payload.sub;
  const email = payload.email;
  const roles = payload.roles;
  const isMfaEnabled = payload.is_mfa_enabled;
  const employeeId = payload.employee_id;
  const mustChangePassword = payload.must_change_password;

  if (typeof id !== "string" || typeof email !== "string") {
    return null;
  }

  const validatedRoles: UserRole[] = [];
  if (Array.isArray(roles)) {
    for (const role of roles) {
      if (isValidRole(role)) {
        validatedRoles.push(role);
      }
    }
  }

  return {
    id,
    email,
    roles: validatedRoles,
    is_mfa_enabled: typeof isMfaEnabled === "boolean" ? isMfaEnabled : false,
    employee_id: typeof employeeId === "string" ? employeeId : null,
    must_change_password:
      typeof mustChangePassword === "boolean" ? mustChangePassword : false,
  };
}
