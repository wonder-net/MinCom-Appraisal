/**
 * Authentication module for the MINCOM Appraisal Platform.
 *
 * Re-exports the AuthProvider, useAuth hook, token store utilities,
 * and all auth-related TypeScript types.
 */

export { AuthProvider, AuthContext } from "./AuthContext";
export { useAuth } from "./useAuth";
export { useRequireRole } from "@/hooks/useRequireRole";
export { ProtectedRoute } from "./ProtectedRoute";
export { RoleGuard } from "./RoleGuard";
export { isAdminUser } from "./role-helpers";
export { default as ForceChangePasswordPage } from "./ForceChangePasswordPage";
export {
  getAccessToken,
  setAccessToken,
  getRefreshToken,
  setRefreshToken,
  clearTokens,
} from "./token-store";
export type {
  User,
  UserRole,
  AuthState,
  AuthContextType,
  LoginResult,
  LoginCredentials,
  LoginSuccessResponse,
  LoginMfaResponse,
  MfaVerifyResponse,
  MfaVerifyResult,
  MfaVerifyRequest,
  TokenRefreshRequest,
  TokenRefreshResponse,
  LogoutRequest,
} from "./types";
