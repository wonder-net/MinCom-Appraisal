/**
 * Unit tests for Axios interceptors (request + response) and auth-api.
 *
 * Covers: token injection, auth endpoint exclusion, 401 refresh flow,
 * concurrent request queuing, _retry flag guard, login redirect on
 * failed refresh, and auth-api functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";
import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import {
  setAccessToken,
  setRefreshToken,
  getAccessToken,
  getRefreshToken,
  clearTokens,
} from "@/auth/token-store";
import type { PaginationMeta } from "@/types";

// ---------------------------------------------------------------------------
// Mock the shared single-flight refresh helper. client.ts now delegates
// the actual refresh + token persistence to `refreshTokenWithLock`, so we
// stub it here to control the refresh outcome AND simulate the token-store
// side effect (setAccessToken / setRefreshToken) that the real helper
// performs.
// ---------------------------------------------------------------------------

import { setAccessToken as realSetAccessToken, setRefreshToken as realSetRefreshToken } from "@/auth/token-store";

const mockRefreshTokenWithLock =
  vi.fn<() => Promise<{ access: string; refresh: string } | null>>();

vi.mock("@/auth/refresh-with-lock", () => ({
  refreshTokenWithLock: () => mockRefreshTokenWithLock(),
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks are registered
// ---------------------------------------------------------------------------

// We need a fresh import of the client for each test to reset state.
// The module-level `isRefreshing` and `failedRequestQueue` persist,
// so we use the exported _resetInterceptorState helper.
import { apiClient, _resetInterceptorState } from "../client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal AxiosResponse for testing. */
function makeResponse(
  status: number,
  data: unknown = {},
  config?: Partial<InternalAxiosRequestConfig>,
): AxiosResponse {
  const resolvedConfig = {
    headers: axios.defaults.headers as unknown as InternalAxiosRequestConfig["headers"],
    ...config,
  } as InternalAxiosRequestConfig;
  return {
    data,
    status,
    statusText: status === 200 ? "OK" : "Unauthorized",
    headers: {},
    config: resolvedConfig,
  };
}

/** Creates a minimal AxiosError for testing. */
function makeAxiosError(
  status: number,
  config: Partial<InternalAxiosRequestConfig>,
): AxiosError {
  const resolvedConfig = {
    headers: axios.defaults.headers as unknown as InternalAxiosRequestConfig["headers"],
    ...config,
  } as InternalAxiosRequestConfig;
  const error = new Error("Request failed") as AxiosError;
  error.config = resolvedConfig;
  error.response = makeResponse(status, {}, resolvedConfig);
  error.isAxiosError = true;
  return error;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

/** Stores the original window.location for restoration. */
let originalLocation: Location;

beforeEach(() => {
  clearTokens();
  _resetInterceptorState();
  mockRefreshTokenWithLock.mockReset();
  originalLocation = window.location;
});

/**
 * Helper that wraps a `{ access, refresh }` value to mimic the real
 * `refreshTokenWithLock` side effect: persist the new tokens in the
 * token store before resolving. Tests for the interceptor still need
 * the token-store to reflect the new values, since the interceptor
 * reads them back when attaching headers to retried requests.
 */
function mockSuccessfulRefresh(
  access: string,
  refresh: string,
): { access: string; refresh: string } {
  realSetAccessToken(access);
  realSetRefreshToken(refresh);
  return { access, refresh };
}

afterEach(() => {
  // Restore original window.location if it was replaced
  if (window.location !== originalLocation) {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  }
});

// ---------------------------------------------------------------------------
// Test Suite: Request Interceptor
// ---------------------------------------------------------------------------

describe("Request Interceptor", () => {
  it("adds Authorization header when token exists", () => {
    setAccessToken("test-access-token");

    // Run the request interceptor manually via the handlers
    const interceptor = apiClient.interceptors.request as unknown as {
      handlers: Array<{
        fulfilled: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig;
      }>;
    };
    const handler = interceptor.handlers[0];
    expect(handler).toBeDefined();

    const config = {
      url: "employees/me/",
      headers: new axios.AxiosHeaders(),
    } as InternalAxiosRequestConfig;

    const result = handler.fulfilled(config);
    expect(result.headers.Authorization).toBe("Bearer test-access-token");
  });

  it("does NOT add Authorization header when no token is stored", () => {
    // Token store is empty (cleared in beforeEach)
    const interceptor = apiClient.interceptors.request as unknown as {
      handlers: Array<{
        fulfilled: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig;
      }>;
    };
    const handler = interceptor.handlers[0];

    const config = {
      url: "employees/me/",
      headers: new axios.AxiosHeaders(),
    } as InternalAxiosRequestConfig;

    const result = handler.fulfilled(config);
    expect(result.headers.Authorization).toBeUndefined();
  });

  it("skips Authorization header for login URL", () => {
    setAccessToken("test-access-token");

    const interceptor = apiClient.interceptors.request as unknown as {
      handlers: Array<{
        fulfilled: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig;
      }>;
    };
    const handler = interceptor.handlers[0];

    const config = {
      url: "auth/login/",
      headers: new axios.AxiosHeaders(),
    } as InternalAxiosRequestConfig;

    const result = handler.fulfilled(config);
    expect(result.headers.Authorization).toBeUndefined();
  });

  it("skips Authorization header for token refresh URL", () => {
    setAccessToken("test-access-token");

    const interceptor = apiClient.interceptors.request as unknown as {
      handlers: Array<{
        fulfilled: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig;
      }>;
    };
    const handler = interceptor.handlers[0];

    const config = {
      url: "auth/token/refresh/",
      headers: new axios.AxiosHeaders(),
    } as InternalAxiosRequestConfig;

    const result = handler.fulfilled(config);
    expect(result.headers.Authorization).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Response Interceptor — 401 Refresh Flow
// ---------------------------------------------------------------------------

describe("Response Interceptor — 401 Refresh", () => {
  it("catches 401, triggers token refresh, and retries the request", async () => {
    setAccessToken("expired-access");
    setRefreshToken("valid-refresh");

    mockRefreshTokenWithLock.mockImplementationOnce(async () =>
      mockSuccessfulRefresh("new-access-token", "new-refresh-token"),
    );

    // Mock the adapter to simulate the retry succeeding after refresh
    const originalAdapter = apiClient.defaults.adapter;
    let callCount = 0;
    apiClient.defaults.adapter = async (config) => {
      callCount += 1;
      if (callCount === 1) {
        // First call: simulate 401
        throw makeAxiosError(401, { url: "appraisals/" });
      }
      // Retry call: succeed
      return makeResponse(200, { status: "success" }, config);
    };

    try {
      const response = await apiClient.get("appraisals/");
      expect(response.status).toBe(200);
      expect(mockRefreshTokenWithLock).toHaveBeenCalledTimes(1);
      expect(getAccessToken()).toBe("new-access-token");
      expect(getRefreshToken()).toBe("new-refresh-token");
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it("queues concurrent requests during refresh and replays them", async () => {
    setAccessToken("expired-access");
    setRefreshToken("valid-refresh");

    // Use a deferred promise so we control when refresh completes
    let resolveRefresh!: (value: { access: string; refresh: string }) => void;
    const refreshPromise = new Promise<{ access: string; refresh: string } | null>(
      (resolve) => {
        resolveRefresh = (v) => {
          // Simulate the helper's side effect (persist tokens) on resolve
          realSetAccessToken(v.access);
          realSetRefreshToken(v.refresh);
          resolve(v);
        };
      },
    );
    mockRefreshTokenWithLock.mockReturnValueOnce(refreshPromise);

    const originalAdapter = apiClient.defaults.adapter;
    const retryAuthHeaders: string[] = [];
    let adapterCallCount = 0;

    apiClient.defaults.adapter = async (config) => {
      adapterCallCount += 1;
      const authHeader = typeof config.headers?.Authorization === "string"
        ? config.headers.Authorization
        : undefined;

      // First two calls are the initial requests — both return 401
      if (adapterCallCount <= 2) {
        throw makeAxiosError(401, config);
      }

      // Subsequent calls are retries after refresh — capture and succeed
      if (authHeader) {
        retryAuthHeaders.push(authHeader);
      }
      return makeResponse(200, { status: "success" }, config);
    };

    try {
      // Fire two requests that will both get 401
      const req1 = apiClient.get("appraisals/1/");
      const req2 = apiClient.get("appraisals/2/");

      // Give the event loop a tick for the second request to hit the adapter
      // and queue behind the first request's refresh
      await new Promise((r) => setTimeout(r, 10));

      // Resolve the refresh — both queued requests should replay
      resolveRefresh({ access: "new-access", refresh: "new-refresh" });

      const [res1, res2] = await Promise.all([req1, req2]);
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // refreshTokenWithLock should have been called exactly once
      // because the interceptor's queueing guard kicks in for the second
      // 401 while the first refresh is in flight.
      expect(mockRefreshTokenWithLock).toHaveBeenCalledTimes(1);

      // Both retried requests should carry the new token
      expect(retryAuthHeaders).toHaveLength(2);
      expect(retryAuthHeaders[0]).toBe("Bearer new-access");
      expect(retryAuthHeaders[1]).toBe("Bearer new-access");
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it("replays all queued requests with new token after successful refresh", async () => {
    setAccessToken("expired-access");
    setRefreshToken("valid-refresh");

    let resolveRefresh!: (value: { access: string; refresh: string }) => void;
    mockRefreshTokenWithLock.mockReturnValueOnce(
      new Promise<{ access: string; refresh: string } | null>((resolve) => {
        resolveRefresh = (v) => {
          realSetAccessToken(v.access);
          realSetRefreshToken(v.refresh);
          resolve(v);
        };
      }),
    );

    const originalAdapter = apiClient.defaults.adapter;
    const retryHeaders: string[] = [];
    let initialRequest = true;

    apiClient.defaults.adapter = async (config) => {
      const authHeader = typeof config.headers?.Authorization === "string"
        ? config.headers.Authorization
        : undefined;

      if (initialRequest && !authHeader?.includes("refreshed-token")) {
        initialRequest = false;
        throw makeAxiosError(401, config);
      }

      if (authHeader) {
        retryHeaders.push(authHeader);
      }
      return makeResponse(200, { data: "ok" }, config);
    };

    try {
      const requestPromise = apiClient.get("employees/me/");

      await new Promise((r) => setTimeout(r, 10));

      resolveRefresh({ access: "refreshed-token", refresh: "new-refresh" });

      const response = await requestPromise;
      expect(response.status).toBe(200);

      // The retried request should carry the new token
      expect(retryHeaders).toContain("Bearer refreshed-token");
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it("does not start a second refresh cycle for retried requests (_retry flag)", async () => {
    setAccessToken("expired-access");
    setRefreshToken("valid-refresh");

    mockRefreshTokenWithLock.mockImplementationOnce(async () =>
      mockSuccessfulRefresh("new-access", "new-refresh"),
    );

    const originalAdapter = apiClient.defaults.adapter;
    // Always return 401 — even the retry will get 401.
    // Without the _retry guard this would cause an infinite refresh loop.
    apiClient.defaults.adapter = async (config) => {
      throw makeAxiosError(401, config);
    };

    try {
      await expect(apiClient.get("appraisals/")).rejects.toThrow();

      // refreshTokenWithLock should have been called exactly once despite
      // both the original and retried request getting 401
      expect(mockRefreshTokenWithLock).toHaveBeenCalledTimes(1);
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it("redirects to /login when refresh fails", async () => {
    setAccessToken("expired-access");
    setRefreshToken("expired-refresh");

    mockRefreshTokenWithLock.mockRejectedValueOnce(new Error("Refresh failed"));

    // Mock window.location
    const mockLocation = { ...window.location, href: "/dashboard", pathname: "/dashboard" };
    Object.defineProperty(window, "location", {
      value: mockLocation,
      writable: true,
      configurable: true,
    });

    const originalAdapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = async (config) => {
      throw makeAxiosError(401, config);
    };

    try {
      await apiClient.get("appraisals/").catch(() => {
        // Expected rejection
      });

      expect(mockLocation.href).toBe("/login");
      expect(getAccessToken()).toBeNull();
      expect(getRefreshToken()).toBeNull();
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it("does NOT retry auth endpoints on 401 (avoids infinite loop)", async () => {
    setRefreshToken("valid-refresh");

    const originalAdapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = async (config) => {
      throw makeAxiosError(401, config);
    };

    try {
      await expect(
        apiClient.post("auth/token/refresh/", { refresh: "test" }),
      ).rejects.toThrow();

      // refreshTokenWithLock should NOT have been called
      expect(mockRefreshTokenWithLock).not.toHaveBeenCalled();
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it("does NOT retry login endpoint on 401", async () => {
    const originalAdapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = async (config) => {
      throw makeAxiosError(401, config);
    };

    try {
      await expect(
        apiClient.post("auth/login/", { identifier: "a@b.com", password: "x" }),
      ).rejects.toThrow();

      expect(mockRefreshTokenWithLock).not.toHaveBeenCalled();
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it("rejects non-401 errors without attempting refresh", async () => {
    const originalAdapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = async (config) => {
      throw makeAxiosError(500, config);
    };

    try {
      await expect(apiClient.get("employees/")).rejects.toThrow();
      expect(mockRefreshTokenWithLock).not.toHaveBeenCalled();
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it("clears tokens and redirects when no refresh token is available", async () => {
    setAccessToken("expired-access");
    // No refresh token set — the helper resolves to null in this case.
    mockRefreshTokenWithLock.mockResolvedValueOnce(null);

    const mockLocation = { ...window.location, href: "/dashboard", pathname: "/dashboard" };
    Object.defineProperty(window, "location", {
      value: mockLocation,
      writable: true,
      configurable: true,
    });

    const originalAdapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = async (config) => {
      throw makeAxiosError(401, config);
    };

    try {
      await apiClient.get("appraisals/").catch(() => {
        // Expected rejection
      });

      expect(mockLocation.href).toBe("/login");
      // The interceptor still calls the helper — the helper itself is
      // responsible for the "no refresh token" check and returns null.
      expect(mockRefreshTokenWithLock).toHaveBeenCalledTimes(1);
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Response Interceptor — Envelope Unwrapping
// ---------------------------------------------------------------------------

describe("Response Interceptor — Envelope Unwrapping", () => {
  it("unwraps standard envelope: response.data becomes inner data", async () => {
    const originalAdapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = async (config) => {
      return makeResponse(
        200,
        { status: "success", data: { id: 1, name: "Test" }, meta: {} },
        config,
      );
    };

    try {
      const response = await apiClient.get("test/");
      expect(response.data).toEqual({ id: 1, name: "Test" });
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it("does NOT unwrap blob responses (responseType: blob)", async () => {
    const blobData = new Blob(["pdf-content"], { type: "application/pdf" });
    const originalAdapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = async (config) => {
      return makeResponse(200, blobData, config);
    };

    try {
      const response = await apiClient.get("test/pdf/", {
        responseType: "blob",
      });
      expect(response.data).toBe(blobData);
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it("passes through responses without a data key unchanged", async () => {
    const originalAdapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = async (config) => {
      // Simulate a 204 No Content or similar with no body
      return makeResponse(204, null, config);
    };

    try {
      const response = await apiClient.get("test/empty/");
      expect(response.data).toBeNull();
      expect(response.status).toBe(204);
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it("exposes pagination metadata on response.meta for paginated responses", async () => {
    const pagination: PaginationMeta = {
      count: 50,
      next: "/api/v1/items/?page=2",
      previous: null,
    };

    const originalAdapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = async (config) => {
      return makeResponse(
        200,
        {
          status: "success",
          data: { results: [], count: 0 },
          meta: { pagination },
        },
        config,
      );
    };

    try {
      const response = await apiClient.get("items/");
      expect(response.data).toEqual({ results: [], count: 0 });
      expect(response.meta?.pagination).toEqual(pagination);
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it("does NOT unwrap arraybuffer responses (responseType: arraybuffer)", async () => {
    const buffer = new ArrayBuffer(8);
    const originalAdapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = async (config) => {
      return makeResponse(200, buffer, config);
    };

    try {
      const response = await apiClient.get("test/binary/", {
        responseType: "arraybuffer",
      });
      expect(response.data).toBe(buffer);
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });
});

