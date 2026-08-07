/**
 * Token store for JWT access and refresh tokens.
 *
 * Access token: held in a module-scoped variable (in-memory only).
 * This is a deliberate XSS mitigation — the access token is never
 * persisted to any browser storage.
 *
 * Refresh token: persisted in sessionStorage (default) or localStorage
 * (when "Remember Me" is enabled). sessionStorage is cleared when the
 * tab/browser closes; localStorage survives browser restarts. The
 * AuthProvider's restoreSession logic exchanges the refresh token for
 * a new access token on mount.
 *
 * NOTE ON sessionStorage DECISION:
 * Using sessionStorage for the refresh token is an intentional deviation
 * from the original TASK-037 spec (which called for pure in-memory storage
 * for both tokens). The reasons:
 *
 * 1. In-memory tokens are lost on every page refresh, forcing the user to
 *    re-authenticate after any F5 or navigation that triggers a full reload.
 *    This makes the application effectively unusable in practice.
 * 2. sessionStorage is scoped to a single tab and is automatically cleared
 *    when the tab or browser window is closed, unlike localStorage which
 *    persists indefinitely across sessions and tabs.
 * 3. The short-lived access token remains in-memory only, which limits the
 *    window of XSS exposure to the token's TTL.
 * 4. The refresh token in sessionStorage can only be exchanged once (it is
 *    rotated on each use), so even if exfiltrated, the attack window is
 *    constrained.
 *
 * The Axios client (api/client.ts) imports getAccessToken() from here
 * to attach the Authorization header to outgoing requests.
 */

const REFRESH_TOKEN_KEY = "mincom_rt";
const REMEMBER_ME_KEY = "mincom_remember";

let accessToken: string | null = null;

/** Returns the current in-memory access token, or null if absent. */
export function getAccessToken(): string | null {
  return accessToken;
}

/** Stores the access token in memory. */
export function setAccessToken(token: string): void {
  accessToken = token;
}

/**
 * Persists the "Remember Me" preference to localStorage.
 * When true, refresh tokens are stored in localStorage (survive browser close).
 * When false (default), refresh tokens use sessionStorage (cleared on close).
 */
export function setRememberMe(value: boolean): void {
  try {
    localStorage.setItem(REMEMBER_ME_KEY, value ? "true" : "false");
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

/**
 * Reads the "Remember Me" preference from localStorage.
 * Defaults to false when the key is absent (safe default — no regression).
 */
export function getRememberMe(): boolean {
  try {
    return localStorage.getItem(REMEMBER_ME_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Returns the refresh token, checking localStorage first then sessionStorage.
 * This fallback order ensures existing sessionStorage sessions survive after
 * an upgrade, and localStorage tokens (Remember Me) take priority.
 */
export function getRefreshToken(): string | null {
  try {
    const fromLocal = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (fromLocal !== null) return fromLocal;
  } catch {
    // localStorage may be unavailable
  }
  try {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    // sessionStorage may be unavailable in certain contexts (e.g. SSR)
    return null;
  }
}

/**
 * Stores the refresh token in the appropriate storage.
 * Uses localStorage when Remember Me is enabled, sessionStorage otherwise.
 */
export function setRefreshToken(token: string): void {
  try {
    if (getRememberMe()) {
      localStorage.setItem(REFRESH_TOKEN_KEY, token);
    } else {
      sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
    }
  } catch {
    // Silently fail if storage is unavailable
  }
}

/**
 * Clears access token from memory and refresh token from BOTH storages.
 * Also removes the Remember Me flag from localStorage.
 * Clearing both storages handles the case where the user toggled
 * the Remember Me checkbox across sessions.
 */
export function clearTokens(): void {
  accessToken = null;
  try {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(REMEMBER_ME_KEY);
  } catch {
    // Silently fail if localStorage is unavailable
  }
  try {
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // Silently fail if sessionStorage is unavailable
  }
}
