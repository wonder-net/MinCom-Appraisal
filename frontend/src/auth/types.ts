/**
 * TypeScript type definitions for the authentication module.
 *
 * These types model the auth state, API request/response shapes,
 * and the interface exposed by the AuthContext.
 */

/** A user's role within the MINCOM Appraisal Platform. */
export type UserRole =
  | "EMPLOYEE"
  | "MANAGER"
  | "HR_OFFICER"
  | "HR_ADMIN"
  | "SYSTEM_ADMIN"
  | "EXECUTIVE";

/** The authenticated user's profile, as returned by the login endpoint. */
export interface User {
  id: string;
  email: string;
  roles: UserRole[];
  is_mfa_enabled: boolean;
  employee_id: string | null;
  must_change_password: boolean;
}

/** Internal authentication state tracked by the AuthProvider. */
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mfaSetupRequired: boolean;
}

/** Result returned by the login function to the caller. */
export interface LoginResult {
  success: boolean;
  mfaRequired?: boolean;
  mfaToken?: string;
  error?: string;
  /** Structured error code from the API envelope (e.g. ``NO_SPA_ROLES_ASSIGNED``). */
  errorCode?: string;
  lockoutSeconds?: number;
  captchaRequired?: boolean;
}

/** Credentials submitted to the login endpoint. */
export interface LoginCredentials {
  /** Email address OR employee number — server resolves to a user. */
  identifier: string;
  password: string;
  captcha_token?: string;
}

/** Successful login response when MFA is not required. */
export interface LoginSuccessResponse {
  access: string;
  refresh: string;
  user: User;
  must_change_password?: boolean;
  mfa_setup_required?: boolean;
}

/** Login response when MFA verification is required. */
export interface LoginMfaResponse {
  mfa_required: true;
  mfa_token: string;
}

/** Successful MFA verification response containing tokens and user. */
export interface MfaVerifyResponse {
  access: string;
  refresh: string;
  user: User;
  must_change_password?: boolean;
}

/** Request body for the MFA verification endpoint (TOTP code). */
export interface MfaVerifyTotpRequest {
  mfa_token: string;
  code: string;
}

/** Request body for the MFA verification endpoint (recovery code). */
export interface MfaVerifyRecoveryRequest {
  mfa_token: string;
  recovery_code: string;
}

/** Request body for the MFA verification endpoint. */
export type MfaVerifyRequest = MfaVerifyTotpRequest | MfaVerifyRecoveryRequest;

/** Request body for the token refresh endpoint. */
export interface TokenRefreshRequest {
  refresh: string;
}

/** Response from the token refresh endpoint. */
export interface TokenRefreshResponse {
  access: string;
  refresh: string;
}

/** Request body for the logout endpoint. */
export interface LogoutRequest {
  refresh: string;
}

/** Result returned by the verifyMFA function to the caller. */
export interface MfaVerifyResult {
  success: boolean;
  error?: string;
  /** Structured error code from the API envelope (e.g. ``NO_SPA_ROLES_ASSIGNED``). */
  errorCode?: string;
}

/**
 * The public interface of the AuthContext, consumed via the useAuth hook.
 *
 * Provides the current auth state, the in-memory access token, and
 * functions to manage the session.
 */
export interface AuthContextType extends AuthState {
  /** The current in-memory access token, or null if not authenticated. */
  accessToken: string | null;
  /** Authenticate with an identifier (email OR employee number) and password.
   *  Returns a LoginResult. */
  login: (
    identifier: string,
    password: string,
    captchaToken?: string,
    rememberMe?: boolean,
  ) => Promise<LoginResult>;
  /** Complete MFA verification after a login that requires it.
   *  When isRecoveryCode is true, sends the value as recovery_code instead of code. */
  verifyMFA: (mfaToken: string, code: string, isRecoveryCode?: boolean, rememberMe?: boolean) => Promise<MfaVerifyResult>;
  /** End the current session and clear all tokens. */
  logout: () => Promise<void>;
  /** Update the in-memory user object (e.g. after MFA setup changes is_mfa_enabled). */
  updateUser: (updates: Partial<User>) => void;
  /** Refresh the session — gets a new access token and updates user state. */
  refreshSession: () => Promise<void>;
}
