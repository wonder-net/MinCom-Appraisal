/**
 * Centralised Axios client for the MINCOM Appraisal Platform.
 *
 * All API calls MUST go through this client. Never import Axios
 * directly in components or feature modules.
 *
 * Configured with:
 * - Base URL: /api/v1/
 * - JSON content type
 * - 30-second timeout
 * - JWT token injection via request interceptor
 * - Automatic 401 handling via response interceptor
 */

import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import type { PaginationMeta } from "@/types";

/**
 * Module augmentation: adds `meta` to AxiosResponse so the
 * envelope-unwrap interceptor can expose pagination metadata
 * without an `any` cast.
 */
declare module "axios" {
  interface AxiosResponse {
    meta?: {
      pagination?: PaginationMeta;
    };
  }
}

/**
 * Extended request config that carries a retry flag.
 * When a request has already been retried after a token refresh,
 * this flag prevents it from triggering another refresh cycle.
 */
interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

import {
  getAccessToken,
  clearTokens,
} from "@/auth/token-store";

import { refreshTokenWithLock } from "@/auth/refresh-with-lock";

/**
 * URL path segments that identify auth endpoints.
 * The request interceptor skips token injection for these,
 * and the response interceptor does not retry them on 401.
 */
const AUTH_URL_PATTERNS = [
  "auth/login",
  "auth/token/refresh",
] as const;

/**
 * Returns true when the given URL belongs to an auth endpoint
 * that should be excluded from interceptor token handling.
 */
function isAuthEndpoint(url: string | undefined): boolean {
  if (!url) return false;
  return AUTH_URL_PATTERNS.some((pattern) => url.includes(pattern));
}

/**
 * Queue of 401-d requests that arrived while a token refresh was
 * in progress. Each entry holds the resolve/reject pair from the
 * wrapping Promise, which will be settled once the refresh
 * completes.
 *
 * Note: the single-flight lock for the refresh call itself lives
 * in `refresh-with-lock.ts`. This queue is interceptor-specific —
 * it holds the original axios requests so they can be replayed
 * with the new access token, which is concern unique to the
 * response interceptor.
 */
interface QueueEntry {
  resolve: (value: AxiosResponse | PromiseLike<AxiosResponse>) => void;
  reject: (error: unknown) => void;
  originalRequest: InternalAxiosRequestConfig;
}

let failedRequestQueue: QueueEntry[] = [];

/**
 * Tracks whether the interceptor is currently waiting on a refresh
 * so that further 401-d requests can be queued for replay rather
 * than triggering parallel refresh attempts. The actual single-flight
 * dedupe of the network call lives in `refresh-with-lock.ts`; this
 * flag exists purely to gate the queueing logic below.
 */
let isRefreshing = false;

/**
 * Processes the queued requests after a token refresh attempt.
 * On success, retries each original request with the new token.
 * On failure, rejects all pending promises with the error.
 */
function processFailedRequestQueue(
  token: string | null,
  error: unknown,
): void {
  const queue = [...failedRequestQueue];
  failedRequestQueue = [];

  for (const pending of queue) {
    if (error) {
      pending.reject(error);
    } else {
      if (token && pending.originalRequest.headers) {
        pending.originalRequest.headers.Authorization = `Bearer ${token}`;
      }
      pending.resolve(apiClient(pending.originalRequest));
    }
  }
}

/**
 * Clears all auth state and redirects the user to the login page.
 * Called when a token refresh fails, indicating the session has expired.
 */
function handleSessionExpired(): void {
  clearTokens();
  const loginPath = `${import.meta.env.BASE_URL}login`;
  if (typeof window !== "undefined" && window.location.pathname !== loginPath) {
    window.location.href = loginPath;
  }
}

/**
 * The shared Axios instance used for all API communication. Base URL is
 * derived from Vite's `base` config (see vite.config.ts) rather than a
 * hardcoded "/api/v1/" — this app is served off-root in some deployments
 * (e.g. this MAMP environment's `Alias /MinCom-Appraisal`), and
 * `import.meta.env.BASE_URL` is the single source of truth for that
 * prefix everywhere in the app (see also src/App.tsx's router `basename`).
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: `${import.meta.env.BASE_URL}api/v1/`,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30_000,
});

/**
 * Request interceptor: injects the JWT access token into the
 * Authorization header if one is available. Skips auth endpoints
 * (login, refresh) to avoid sending stale/invalid tokens.
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    if (isAuthEndpoint(config.url)) {
      return config;
    }

    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError): Promise<never> => {
    return Promise.reject(error);
  },
);

/**
 * Response interceptor: handles 401 Unauthorized errors by
 * attempting a token refresh and retrying the original request.
 *
 * Uses a request queue to avoid multiple concurrent refresh calls
 * when several requests fail at the same time.
 */
apiClient.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse => {
    return response;
  },
  async (error: AxiosError): Promise<AxiosResponse> => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;

    // If there is no config, we cannot retry
    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Only attempt refresh on 401 responses
    if (error.response?.status !== 401) {
      return Promise.reject(error);
    }

    // Avoid infinite loop: do not retry auth endpoints
    if (isAuthEndpoint(originalRequest.url)) {
      return Promise.reject(error);
    }

    // Prevent retried requests from triggering another refresh cycle.
    // This guards against the race condition where isRefreshing is set
    // to false (in finally) before queued retries complete — a new 401
    // on a retried request must not start a second refresh.
    // When a retried request still gets 401, the session is truly
    // expired — redirect to login immediately.
    if (originalRequest._retry) {
      handleSessionExpired();
      return Promise.reject(error);
    }
    originalRequest._retry = true;

    // If a refresh is already in progress, queue this request
    if (isRefreshing) {
      return new Promise<AxiosResponse>((resolve, reject) => {
        failedRequestQueue = [
          ...failedRequestQueue,
          { originalRequest, resolve, reject },
        ];
      });
    }

    isRefreshing = true;

    try {
      // Delegate the actual refresh to the shared single-flight helper.
      // This ensures concurrent refresh attempts from other code paths
      // (scheduled background refresh, session restore on mount) share
      // the same network request and the same rotated-token result.
      const tokens = await refreshTokenWithLock();
      // No stored refresh token — session is gone. Reject queued
      // requests and redirect to login.
      if (tokens === null) {
        processFailedRequestQueue(null, error);
        handleSessionExpired();
        return Promise.reject(error);
      }

      const { access } = tokens;

      // Retry all queued requests with the new token
      processFailedRequestQueue(access, null);

      // Retry the original request that triggered the refresh
      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${access}`;
      }
      return apiClient(originalRequest);
    } catch (refreshError: unknown) {
      processFailedRequestQueue(null, refreshError);
      handleSessionExpired();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

/**
 * Response interceptor: unwraps the StandardResponseRenderer envelope.
 *
 * The backend wraps all successful JSON responses in:
 *   { "status": "success", "data": <payload>, "meta": { "pagination": {...} } }
 *
 * This interceptor sets `response.data` to the inner `data` value and
 * `response.meta` to the envelope's `meta` field, so consumers receive
 * the payload directly without navigating a double `.data.data` path.
 *
 * Binary responses (responseType "blob" or "arraybuffer") are passed
 * through unchanged — the envelope is only present for JSON responses.
 */
apiClient.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse => {
    const responseType = response.config.responseType;
    if (responseType === "blob" || responseType === "arraybuffer") {
      return response;
    }

    const body = response.data;
    if (
      body !== null &&
      typeof body === "object" &&
      "data" in body &&
      "status" in body &&
      (body as Record<string, unknown>).status === "success"
    ) {
      const envelope = body as { data: unknown; meta?: { pagination?: PaginationMeta } };
      response.meta = envelope.meta;
      response.data = envelope.data;
    }

    return response;
  },
);

/**
 * Resets the interceptor's internal refresh state.
 * Exported exclusively for testing — do not use in production code.
 */
export function _resetInterceptorState(): void {
  isRefreshing = false;
  failedRequestQueue = [];
}
