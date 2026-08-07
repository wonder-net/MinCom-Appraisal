/**
 * Single-flight token refresh.
 *
 * The backend rotates refresh tokens on every successful `auth/token/refresh/`
 * call and immediately blacklists the previous one. If multiple frontend code
 * paths race to refresh the same stale refresh token concurrently, only one
 * call will succeed — the others will receive 401 because their copy of the
 * refresh token has just been blacklisted. The losing callers then log the
 * user out unnecessarily.
 *
 * This module exports `refreshTokenWithLock()`, which guarantees that all
 * concurrent callers share a single in-flight refresh promise. The lock is
 * stored in a module-level variable and cleared in `finally` so the next
 * refresh starts fresh.
 *
 * The function reads the current refresh token from `token-store`, calls the
 * un-intercepted `refreshTokenApi` (so it never re-enters the axios 401
 * interceptor), and persists the rotated tokens via `setAccessToken` /
 * `setRefreshToken`. All callers — the axios 401 interceptor, the scheduled
 * background refresh, and the mount-time session restore — should use this
 * function instead of calling `refreshTokenApi` directly.
 *
 * Design notes:
 * - This module is a leaf module: it imports from `auth-api` and
 *   `token-store`, but is NOT imported by either. `client.ts` and
 *   `AuthContext.tsx` import this module. This keeps the dependency graph
 *   acyclic.
 * - On error, the in-flight promise is cleared and the error propagates to
 *   all queued callers, who handle logout / retry themselves.
 * - When no refresh token is in storage, the function returns `null`
 *   without making a network request. Callers treat `null` as "session
 *   expired" and redirect / reset state.
 */

import { refreshTokenApi } from "@/api/auth-api";
import type { TokenRefreshResponse } from "./types";
import {
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "./token-store";

/**
 * The in-flight refresh promise, or null when no refresh is active.
 * All concurrent callers receive this promise so they share a single
 * network request.
 */
let inFlight: Promise<TokenRefreshResponse | null> | null = null;

/**
 * Refresh the access + refresh tokens, sharing one network request
 * across all concurrent callers.
 *
 * Returns the new `{ access, refresh }` pair on success, or `null`
 * when no refresh token is stored (i.e. the session is gone).
 *
 * Errors from the underlying refresh call propagate to all queued
 * callers, who are responsible for handling them (typically by
 * clearing auth state and redirecting to /login).
 */
export function refreshTokenWithLock(): Promise<TokenRefreshResponse | null> {
  if (inFlight !== null) {
    return inFlight;
  }

  const currentRefresh = getRefreshToken();
  if (!currentRefresh) {
    // No stored refresh token — return null synchronously without
    // wrapping in inFlight so subsequent callers (e.g. after a real
    // login flow stores a token) are not blocked.
    return Promise.resolve(null);
  }

  inFlight = (async () => {
    try {
      const tokens = await refreshTokenApi(currentRefresh);
      setAccessToken(tokens.access);
      setRefreshToken(tokens.refresh);
      return tokens;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Resets the in-flight refresh state.
 * Exported exclusively for testing — do not use in production code.
 */
export function _resetRefreshLock(): void {
  inFlight = null;
}
