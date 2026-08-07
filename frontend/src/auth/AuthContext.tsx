/**
 * AuthContext and AuthProvider for the MINCOM Appraisal Platform.
 *
 * Manages login (with MFA), token storage (in-memory only),
 * automatic token refresh, logout, and session restoration on mount.
 */

import {
  createContext, useCallback, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import { apiClient } from "@/api";
import {
  getAccessToken, getRefreshToken, setAccessToken, setRefreshToken, clearTokens,
  setRememberMe, getRememberMe,
} from "./token-store";
import { refreshTokenWithLock } from "./refresh-with-lock";
import {
  REFRESH_MARGIN_MS, decodeUserFromToken, extractErrorCode, extractErrorMessage,
  getTokenExpiryMs, isLoginSuccess,
} from "./auth-utils";
import type {
  AuthContextType, LoginMfaResponse, LoginResult, LoginSuccessResponse,
  MfaVerifyRequest, MfaVerifyResponse, MfaVerifyResult, User,
} from "./types";

export const AuthContext = createContext<AuthContextType | null>(null);

const MFA_SETUP_REQUIRED_KEY = "mfa_setup_required";

/**
 * Returns the storage backend for the MFA setup flag.
 * Uses localStorage when "Remember Me" is enabled, sessionStorage otherwise.
 * This keeps the flag in the same storage as the refresh token.
 */
function mfaStorage(): Storage {
  return getRememberMe() ? localStorage : sessionStorage;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [mfaSetupRequired, setMfaSetupRequired] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Ref that holds the latest performTokenRefresh function.
   * This avoids the stale closure problem in scheduleTokenRefresh's
   * setTimeout callback, since the ref always points to the current
   * version of the function.
   */
  const performTokenRefreshRef = useRef<() => Promise<string | null>>(
    () => Promise.resolve(null),
  );

  const cancelRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleTokenRefresh = useCallback(
    (accessTokenValue: string) => {
      cancelRefreshTimer();
      const expiryMs = getTokenExpiryMs(accessTokenValue);
      const refreshIn = Math.max(expiryMs - REFRESH_MARGIN_MS, 0);
      refreshTimerRef.current = setTimeout(() => {
        void performTokenRefreshRef.current();
      }, refreshIn);
    },
    [cancelRefreshTimer],
  );

  const handleAuthSuccess = useCallback(
    (accessTokenValue: string, refreshTokenValue: string, userData: User) => {
      setAccessToken(accessTokenValue);
      setRefreshToken(refreshTokenValue);
      setUser(userData);
      setIsAuthenticated(true);
      scheduleTokenRefresh(accessTokenValue);
    },
    [scheduleTokenRefresh],
  );

  const resetAuthState = useCallback(() => {
    cancelRefreshTimer();
    clearTokens();
    setUser(null);
    setIsAuthenticated(false);
  }, [cancelRefreshTimer]);

  const performTokenRefresh = useCallback(async (): Promise<string | null> => {
    try {
      // Delegate to the shared single-flight helper so this background
      // refresh shares a network request with any concurrent refresh
      // happening from the axios 401 interceptor or session restore.
      const tokens = await refreshTokenWithLock();
      if (tokens === null) {
        // No refresh token in storage — session is gone.
        resetAuthState();
        return null;
      }

      const { access } = tokens;

      // Extract user data from the new access token to keep state in sync
      const userData = decodeUserFromToken(access);
      if (userData) {
        setUser(userData);
        setIsAuthenticated(true);
        scheduleTokenRefresh(access);
        return access;
      }

      // Malformed token: clear tokens to avoid inconsistent state
      resetAuthState();
      return null;
    } catch {
      resetAuthState();
      return null;
    }
  }, [resetAuthState, scheduleTokenRefresh]);

  // Keep the ref in sync with the latest performTokenRefresh
  performTokenRefreshRef.current = performTokenRefresh;

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser((prev) => prev ? { ...prev, ...updates } : prev);
  }, []);

  const login = useCallback(
    async (
      identifier: string,
      password: string,
      captchaToken?: string,
      rememberMe?: boolean,
    ): Promise<LoginResult> => {
      try {
        const body: Record<string, string> = { identifier, password };
        if (captchaToken) {
          body.captcha_token = captchaToken;
        }
        const response = await apiClient.post<
          LoginSuccessResponse | LoginMfaResponse
        >("auth/login/", body);
        const data = response.data;

        if (isLoginSuccess(data)) {
          setRememberMe(rememberMe ?? false);
          handleAuthSuccess(data.access, data.refresh, data.user);
          const mfaFlag = data.mfa_setup_required ?? true;
          setMfaSetupRequired(mfaFlag);
          // Only persist when false — absent key means true (safe default)
          if (!mfaFlag) {
            mfaStorage().setItem(MFA_SETUP_REQUIRED_KEY, "false");
          } else {
            mfaStorage().removeItem(MFA_SETUP_REQUIRED_KEY);
          }
          if (data.must_change_password === true) {
            updateUser({ must_change_password: true });
          }
          return { success: true };
        }
        return {
          success: false,
          mfaRequired: true,
          mfaToken: data.mfa_token,
        };
      } catch (error: unknown) {
        const message = extractErrorMessage(error);
        const errorCode = extractErrorCode(error);
        let lockoutSeconds: number | undefined;
        let captchaRequired: boolean | undefined;

        if (
          typeof error === "object" &&
          error !== null &&
          "response" in error
        ) {
          const axiosError = error as {
            response?: {
              data?: {
                data?: {
                  lockout_remaining_seconds?: unknown;
                  captcha_required?: unknown;
                };
              };
            };
          };
          const errData = axiosError.response?.data?.data;
          if (errData) {
            if (typeof errData.lockout_remaining_seconds === "number") {
              lockoutSeconds = errData.lockout_remaining_seconds;
            }
            if (errData.captcha_required === true) {
              captchaRequired = true;
            }
          }
        }

        return {
          success: false,
          error: message,
          errorCode,
          lockoutSeconds,
          captchaRequired,
        };
      }
    },
    [handleAuthSuccess, updateUser],
  );

  const verifyMFA = useCallback(
    async (mfaToken: string, code: string, isRecoveryCode = false, rememberMe?: boolean): Promise<MfaVerifyResult> => {
      try {
        const body: MfaVerifyRequest = isRecoveryCode
          ? { mfa_token: mfaToken, recovery_code: code }
          : { mfa_token: mfaToken, code };
        const response = await apiClient.post<MfaVerifyResponse>(
          "auth/mfa/verify-login/",
          body,
        );
        const data = response.data;
        setRememberMe(rememberMe ?? false);
        handleAuthSuccess(data.access, data.refresh, data.user);
        if (data.must_change_password === true) {
          updateUser({ must_change_password: true });
        }
        return { success: true };
      } catch (error: unknown) {
        return {
          success: false,
          error: extractErrorMessage(error),
          errorCode: extractErrorCode(error),
        };
      }
    },
    [handleAuthSuccess, updateUser],
  );

  const refreshSession = useCallback(async (): Promise<void> => {
    const token = await performTokenRefresh();
    if (!token) {
      throw new Error("Session refresh failed");
    }
  }, [performTokenRefresh]);

  const logout = useCallback(async (): Promise<void> => {
    const currentRefresh = getRefreshToken();
    resetAuthState();
    // Clear MFA flag from BOTH storages (not via mfaStorage()) because
    // clearTokens() already wiped mincom_remember, so mfaStorage() would
    // only target sessionStorage and miss a localStorage remnant.
    localStorage.removeItem(MFA_SETUP_REQUIRED_KEY);
    sessionStorage.removeItem(MFA_SETUP_REQUIRED_KEY);
    setMfaSetupRequired(true);
    if (currentRefresh) {
      try {
        await apiClient.post("auth/logout/", { refresh: currentRefresh });
      } catch {
        // Swallow logout errors -- client state is already cleared
      }
    }
  }, [resetAuthState]);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      const currentRefresh = getRefreshToken();
      if (!currentRefresh) {
        if (!cancelled) setIsLoading(false);
        return;
      }
      try {
        // Delegate to the shared single-flight helper. On a normal page
        // refresh, hooks like useUnreadCount fire API calls with the
        // expired access token at the same time this restore runs — the
        // lock ensures both paths share one refresh request rather than
        // racing to blacklist each other's refresh token.
        const tokens = await refreshTokenWithLock();
        if (cancelled) return;

        if (tokens === null) {
          // The stored refresh token disappeared between the check above
          // and the lock — treat as session gone.
          resetAuthState();
          return;
        }

        const { access } = tokens;

        // Decode user data from the access token to restore authenticated state
        const userData = decodeUserFromToken(access);
        if (userData) {
          setUser(userData);
          setIsAuthenticated(true);
          scheduleTokenRefresh(access);
          // Restore MFA flag from the same storage as the refresh token
          const storedMfaFlag = mfaStorage().getItem(MFA_SETUP_REQUIRED_KEY);
          if (storedMfaFlag === "false") {
            setMfaSetupRequired(false);
          }
        } else {
          resetAuthState();
        }
      } catch {
        // In StrictMode, the first mount's refresh may have already
        // rotated the token. If this mount was cancelled, don't logout —
        // the next mount will retry with the new token from storage.
        if (!cancelled) resetAuthState();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void restoreSession();
    return () => {
      cancelled = true;
      cancelRefreshTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accessToken = isAuthenticated ? getAccessToken() : null;

  const contextValue = useMemo<AuthContextType>(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      mfaSetupRequired,
      accessToken,
      login,
      verifyMFA,
      logout,
      updateUser,
      refreshSession,
    }),
    [user, isAuthenticated, isLoading, mfaSetupRequired, accessToken, login, verifyMFA, logout, updateUser, refreshSession],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}
