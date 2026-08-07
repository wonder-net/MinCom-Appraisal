/**
 * Dedicated auth API functions for the MINCOM Appraisal Platform.
 *
 * Uses a separate Axios instance (no interceptors) to avoid circular
 * dependency: the main apiClient's response interceptor calls
 * refreshTokenApi(), so auth-api must NOT go through that interceptor.
 */

import axios from "axios";
import type { ApiResponse } from "@/types";
import type {
  LoginSuccessResponse,
  LoginMfaResponse,
  TokenRefreshResponse,
  MfaVerifyResponse,
} from "@/auth/types";

/**
 * Standalone Axios instance for authentication endpoints.
 * No interceptors are attached — this avoids infinite loops when
 * the main client's 401 handler calls refreshTokenApi.
 */
const authClient = axios.create({
  // See src/api/client.ts's apiClient for why this is derived from Vite's
  // `base` config rather than a hardcoded "/api/v1/".
  baseURL: `${import.meta.env.BASE_URL}api/v1/`,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30_000,
});

/** Response shape for the login endpoint. */
export type LoginApiResponse = ApiResponse<LoginSuccessResponse | LoginMfaResponse>;

/** Response shape for the MFA verify endpoint. */
export type MfaVerifyApiResponse = ApiResponse<MfaVerifyResponse>;

/** Response shape for the token refresh endpoint. */
export type RefreshApiResponse = ApiResponse<TokenRefreshResponse>;

/**
 * Authenticate a user with an identifier (email OR employee number)
 * and password. Optionally includes a Cloudflare Turnstile CAPTCHA token.
 */
export async function loginApi(
  identifier: string,
  password: string,
  captchaToken?: string,
): Promise<LoginApiResponse> {
  const body: Record<string, string> = { identifier, password };
  if (captchaToken) {
    body.captcha_token = captchaToken;
  }
  const response = await authClient.post<LoginApiResponse>("auth/login/", body);
  return response.data;
}

/**
 * Refresh the JWT access token using a valid refresh token.
 * Returns both new access and refresh tokens.
 */
export async function refreshTokenApi(
  refreshToken: string,
): Promise<TokenRefreshResponse> {
  const response = await authClient.post<RefreshApiResponse>(
    "auth/token/refresh/",
    { refresh: refreshToken },
  );
  return response.data.data;
}

/**
 * Invalidate the refresh token on the server (logout).
 */
export async function logoutApi(refreshToken: string): Promise<void> {
  await authClient.post("auth/logout/", { refresh: refreshToken });
}

/**
 * Complete MFA verification during login.
 *
 * This hits the **login** MFA endpoint (`auth/mfa/verify-login/`), which
 * accepts an `mfa_token` plus either a TOTP `code` or a `recovery_code`.
 *
 * NOTE: This is distinct from `mfaSetupConfirmApi`, which hits
 * `auth/mfa/verify/` to confirm initial MFA enrollment (requires auth).
 *
 * When isRecoveryCode is true, sends the value in the recovery_code
 * field instead of the code field.
 */
export async function verifyMFAApi(
  mfaToken: string,
  code: string,
  isRecoveryCode = false,
): Promise<MfaVerifyApiResponse> {
  const body = isRecoveryCode
    ? { mfa_token: mfaToken, recovery_code: code }
    : { mfa_token: mfaToken, code };
  const response = await authClient.post<MfaVerifyApiResponse>(
    "auth/mfa/verify-login/",
    body,
  );
  return response.data;
}

/** Request body shape for the change password endpoint. */
interface ChangePasswordBody {
  old_password: string;
  new_password: string;
  confirm_password: string;
}

/**
 * Change the authenticated user's password.
 *
 * This endpoint requires an access token, so it is called via
 * the auth client with a manually provided Authorization header.
 *
 * NOTE: The `accessToken` parameter is a deliberate deviation from the
 * task spec's interface contract. This function uses the non-intercepted
 * `authClient` (to avoid circular interceptor dependency), so the token
 * cannot be injected automatically. Passing the token per-request is
 * preferred over mutating `authClient.defaults.headers`, which would
 * introduce shared mutable state across concurrent calls.
 */
export async function changePasswordApi(
  oldPassword: string,
  newPassword: string,
  confirmPassword: string,
  accessToken: string,
): Promise<void> {
  const body: ChangePasswordBody = {
    old_password: oldPassword,
    new_password: newPassword,
    confirm_password: confirmPassword,
  };
  await authClient.post("auth/password/change/", body, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/** Response shape for the MFA setup endpoint. */
export interface MfaSetupResponse {
  secret: string;
  provisioning_uri: string;
}

/** Response shape for the MFA setup confirm endpoint. */
export interface MfaSetupConfirmResponse {
  recovery_codes: string[];
}

/** MFA status returned by GET /api/v1/auth/mfa/status/. */
export interface MfaStatusResponse {
  is_mfa_enabled: boolean;
  recovery_codes_remaining: number;
}

/** Recovery codes returned by POST /api/v1/auth/mfa/recovery-codes/regenerate/. */
export interface RegenerateRecoveryCodesResponse {
  recovery_codes: string[];
}

/**
 * Initiate MFA setup for the authenticated user.
 * Returns the TOTP secret and a QR code data URL.
 *
 * NOTE: The `accessToken` parameter is a deliberate deviation from the
 * task spec's interface contract. See the comment on changePasswordApi
 * for the rationale — authClient has no interceptors, so the token
 * must be passed explicitly per-request.
 */
export async function mfaSetupApi(
  accessToken: string,
): Promise<ApiResponse<MfaSetupResponse>> {
  const response = await authClient.post<ApiResponse<MfaSetupResponse>>(
    "auth/mfa/setup/",
    {},
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  return response.data;
}

/**
 * Confirm MFA setup by verifying the user's first TOTP code.
 * Returns recovery codes on success.
 */
export async function mfaSetupConfirmApi(
  code: string,
  accessToken: string,
): Promise<ApiResponse<MfaSetupConfirmResponse>> {
  const response = await authClient.post<
    ApiResponse<MfaSetupConfirmResponse>
  >("auth/mfa/verify/", { code }, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.data;
}

/**
 * Disable MFA for the authenticated user.
 * Requires the user's current password for confirmation.
 */
export async function disableMfaApi(
  password: string,
  accessToken: string,
): Promise<void> {
  await authClient.post(
    "auth/mfa/disable/",
    { password },
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
}

/**
 * Regenerate MFA recovery codes for the authenticated user.
 * Returns a new set of recovery codes.
 */
export async function regenerateRecoveryCodesApi(
  accessToken: string,
): Promise<ApiResponse<RegenerateRecoveryCodesResponse>> {
  const response = await authClient.post<
    ApiResponse<RegenerateRecoveryCodesResponse>
  >(
    "auth/mfa/recovery-codes/regenerate/",
    {},
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  return response.data;
}

/**
 * Request a password reset link for the given email address.
 *
 * The backend always returns 200 regardless of whether the email exists,
 * so the caller should always show the same confirmation message.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  await authClient.post("auth/password/reset/request/", { email });
}

/** Request body shape for the password reset confirm endpoint. */
interface ConfirmPasswordResetBody {
  token: string;
  new_password: string;
  new_password_confirm: string;
}

/**
 * Confirm a password reset using the token from the reset email.
 *
 * On 400, the server returns an error envelope with a code of
 * INVALID_TOKEN or VALIDATION_ERROR.
 */
export async function confirmPasswordReset(
  token: string,
  newPassword: string,
  newPasswordConfirm: string,
): Promise<void> {
  const body: ConfirmPasswordResetBody = {
    token,
    new_password: newPassword,
    new_password_confirm: newPasswordConfirm,
  };
  await authClient.post("auth/password/reset/confirm/", body);
}
