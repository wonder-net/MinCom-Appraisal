/**
 * Unit tests for the authentication module.
 *
 * Covers: AuthProvider state management, login (success + MFA),
 * verifyMFA, logout, token store, session restore, and useAuth
 * hook guard.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { AuthProvider } from "../AuthContext";
import { useAuth } from "../useAuth";
import {
  getAccessToken, getRefreshToken, setAccessToken, setRefreshToken,
  clearTokens,
} from "../token-store";
import { extractErrorMessage, decodeUserFromToken } from "../auth-utils";
import type { LoginResult, MfaVerifyResult, User } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a fake JWT with the given payload (no real signature). */
function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

const testUser: User = {
  id: "u-001",
  email: "test@mincom.com",
  roles: ["EMPLOYEE"],
  is_mfa_enabled: false,
  employee_id: null,
  must_change_password: false,
};

const testAccessToken = fakeJwt({
  user_id: testUser.id,
  email: testUser.email,
  roles: testUser.roles,
  is_mfa_enabled: testUser.is_mfa_enabled,
  exp: Math.floor(Date.now() / 1000) + 900, // 15 min
});

const testRefreshToken = "refresh-token-abc";

// ---------------------------------------------------------------------------
// Mock the apiClient (used by login, MFA verify, logout)
// ---------------------------------------------------------------------------

vi.mock("@/api", () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock the shared single-flight refresh helper. AuthContext now delegates
// session restore and the background refresh to `refreshTokenWithLock`.
// The mock persists tokens to the token-store to mirror the real helper's
// side effect, so the rest of the AuthContext code path behaves correctly.
// ---------------------------------------------------------------------------

const mockRefreshTokenWithLock =
  vi.fn<() => Promise<{ access: string; refresh: string } | null>>();

vi.mock("../refresh-with-lock", () => ({
  refreshTokenWithLock: () => mockRefreshTokenWithLock(),
}));

// We import AFTER mock registration so the mock is already in place
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let apiClient: { post: Mock };

beforeEach(async () => {
  // Re-import to get the mocked version
  const apiModule = await import("@/api");
  apiClient = apiModule.apiClient as unknown as { post: Mock };
  apiClient.post.mockReset();
  mockRefreshTokenWithLock.mockReset();
  // By default, no refresh token is present so the helper resolves null.
  mockRefreshTokenWithLock.mockResolvedValue(null);

  // Clean token store between tests
  clearTokens();
});

/**
 * Renders a test component wrapped in AuthProvider and returns
 * the latest auth context value.
 */
function renderWithAuth(ui?: ReactNode) {
  let authValue: ReturnType<typeof useAuth> | undefined;

  function Consumer() {
    authValue = useAuth();
    return null;
  }

  const result = render(
    <AuthProvider>
      {ui ?? null}
      <Consumer />
    </AuthProvider>,
  );

  return {
    ...result,
    getAuth: () => {
      if (!authValue) throw new Error("Auth context not yet available");
      return authValue;
    },
  };
}

// ---------------------------------------------------------------------------
// Test Suite: Token Store
// ---------------------------------------------------------------------------

describe("token-store", () => {
  it("stores and retrieves access token", () => {
    expect(getAccessToken()).toBeNull();
    setAccessToken("my-access-token");
    expect(getAccessToken()).toBe("my-access-token");
  });

  it("stores and retrieves refresh token", () => {
    expect(getRefreshToken()).toBeNull();
    setRefreshToken("my-refresh-token");
    expect(getRefreshToken()).toBe("my-refresh-token");
  });

  it("clearTokens removes both tokens", () => {
    setAccessToken("access");
    setRefreshToken("refresh");
    clearTokens();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: AuthProvider initial state
// ---------------------------------------------------------------------------

describe("AuthProvider initial state", () => {
  it("starts with isLoading=true, isAuthenticated=false, user=null", async () => {
    // No refresh token stored, so restoreSession ends immediately
    let capturedAuth: ReturnType<typeof useAuth> | undefined;

    function Spy() {
      capturedAuth = useAuth();
      return <div data-testid="loaded">{String(capturedAuth.isLoading)}</div>;
    }

    render(
      <AuthProvider>
        <Spy />
      </AuthProvider>,
    );

    // After mount + restoreSession (no token), isLoading becomes false
    await waitFor(() => {
      expect(capturedAuth).toBeDefined();
      expect(capturedAuth!.isLoading).toBe(false);
    });

    expect(capturedAuth!.isAuthenticated).toBe(false);
    expect(capturedAuth!.user).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: login()
// ---------------------------------------------------------------------------

describe("login()", () => {
  it("sets user and isAuthenticated on success", async () => {
    apiClient.post.mockResolvedValueOnce({
      data: {
        access: testAccessToken,
        refresh: testRefreshToken,
        user: testUser,
      },
    });

    const { getAuth } = renderWithAuth();

    // Wait for initial load to complete
    await waitFor(() => expect(getAuth().isLoading).toBe(false));

    await act(async () => {
      const result = await getAuth().login("test@mincom.com", "password123");
      expect(result.success).toBe(true);
    });

    expect(getAuth().isAuthenticated).toBe(true);
    expect(getAuth().user).toEqual(testUser);
    expect(getAccessToken()).toBe(testAccessToken);
    expect(getRefreshToken()).toBe(testRefreshToken);
  });

  it("posts an `identifier` field (not `email`) to the login endpoint", async () => {
    apiClient.post.mockResolvedValueOnce({
      data: {
        access: testAccessToken,
        refresh: testRefreshToken,
        user: testUser,
      },
    });

    const { getAuth } = renderWithAuth();
    await waitFor(() => expect(getAuth().isLoading).toBe(false));

    await act(async () => {
      await getAuth().login("MIN1234", "password123");
    });

    expect(apiClient.post).toHaveBeenCalledWith("auth/login/", {
      identifier: "MIN1234",
      password: "password123",
    });
    // Belt-and-braces: explicitly verify the old `email` field is gone.
    const body = apiClient.post.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty("email");
  });

  it("returns mfaRequired when MFA challenge is returned", async () => {
    apiClient.post.mockResolvedValueOnce({
      data: {
        mfa_required: true,
        mfa_token: "mfa-token-xyz",
      },
    });

    const { getAuth } = renderWithAuth();
    await waitFor(() => expect(getAuth().isLoading).toBe(false));

    let result: LoginResult | undefined;
    await act(async () => {
      result = await getAuth().login("test@mincom.com", "password123");
    });

    expect(result!.success).toBe(false);
    expect(result!.mfaRequired).toBe(true);
    expect(result!.mfaToken).toBe("mfa-token-xyz");
    expect(getAuth().isAuthenticated).toBe(false);
  });

  it("returns error message on failure", async () => {
    apiClient.post.mockRejectedValueOnce({
      response: {
        status: 401,
        data: {
          status: "error",
          data: { message: "Invalid credentials" },
        },
      },
    });

    const { getAuth } = renderWithAuth();
    await waitFor(() => expect(getAuth().isLoading).toBe(false));

    let result: LoginResult | undefined;
    await act(async () => {
      result = await getAuth().login("bad@mincom.com", "wrong");
    });

    expect(result!.success).toBe(false);
    expect(result!.error).toBe("Invalid credentials");
  });
});

// ---------------------------------------------------------------------------
// Test Suite: verifyMFA()
// ---------------------------------------------------------------------------

describe("verifyMFA()", () => {
  it("stores tokens and sets authenticated state on success", async () => {
    apiClient.post.mockResolvedValueOnce({
      data: {
        access: testAccessToken,
        refresh: testRefreshToken,
        user: testUser,
      },
    });

    const { getAuth } = renderWithAuth();
    await waitFor(() => expect(getAuth().isLoading).toBe(false));

    await act(async () => {
      const result = await getAuth().verifyMFA("mfa-token-xyz", "123456");
      expect(result.success).toBe(true);
    });

    expect(getAuth().isAuthenticated).toBe(true);
    expect(getAuth().user).toEqual(testUser);
    expect(getAccessToken()).toBe(testAccessToken);
  });

  it("sends recovery_code field when isRecoveryCode is true", async () => {
    apiClient.post.mockResolvedValueOnce({
      data: {
        access: testAccessToken,
        refresh: testRefreshToken,
        user: testUser,
      },
    });

    const { getAuth } = renderWithAuth();
    await waitFor(() => expect(getAuth().isLoading).toBe(false));

    await act(async () => {
      const result = await getAuth().verifyMFA("mfa-token-xyz", "ABCD-EFGH-IJKL", true);
      expect(result.success).toBe(true);
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      "auth/mfa/verify-login/",
      { mfa_token: "mfa-token-xyz", recovery_code: "ABCD-EFGH-IJKL" },
    );
    expect(getAuth().isAuthenticated).toBe(true);
  });

  it("sends code field (not recovery_code) when isRecoveryCode is false", async () => {
    apiClient.post.mockResolvedValueOnce({
      data: {
        access: testAccessToken,
        refresh: testRefreshToken,
        user: testUser,
      },
    });

    const { getAuth } = renderWithAuth();
    await waitFor(() => expect(getAuth().isLoading).toBe(false));

    await act(async () => {
      const result = await getAuth().verifyMFA("mfa-token-xyz", "123456");
      expect(result.success).toBe(true);
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      "auth/mfa/verify-login/",
      { mfa_token: "mfa-token-xyz", code: "123456" },
    );
  });

  it("returns error on failure without throwing", async () => {
    apiClient.post.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          status: "error",
          data: { message: "Invalid MFA code" },
        },
      },
    });

    const { getAuth } = renderWithAuth();
    await waitFor(() => expect(getAuth().isLoading).toBe(false));

    let result: MfaVerifyResult | undefined;
    await act(async () => {
      result = await getAuth().verifyMFA("mfa-token-xyz", "000000");
    });

    expect(result!.success).toBe(false);
    expect(result!.error).toBe("Invalid MFA code");
    expect(getAuth().isAuthenticated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test Suite: logout()
// ---------------------------------------------------------------------------

describe("logout()", () => {
  it("clears state and calls API", async () => {
    // First login
    apiClient.post.mockResolvedValueOnce({
      data: {
        access: testAccessToken,
        refresh: testRefreshToken,
        user: testUser,
      },
    });

    // Then logout succeeds
    apiClient.post.mockResolvedValueOnce({ data: {} });

    const { getAuth } = renderWithAuth();
    await waitFor(() => expect(getAuth().isLoading).toBe(false));

    // Login first
    await act(async () => {
      await getAuth().login("test@mincom.com", "password123");
    });
    expect(getAuth().isAuthenticated).toBe(true);

    // Now logout
    await act(async () => {
      await getAuth().logout();
    });

    expect(getAuth().isAuthenticated).toBe(false);
    expect(getAuth().user).toBeNull();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();

    // Verify logout API was called
    expect(apiClient.post).toHaveBeenCalledWith(
      "auth/logout/",
      { refresh: testRefreshToken },
    );
  });

  it("clears state even if API call fails", async () => {
    // Login
    apiClient.post.mockResolvedValueOnce({
      data: {
        access: testAccessToken,
        refresh: testRefreshToken,
        user: testUser,
      },
    });

    // Logout API fails
    apiClient.post.mockRejectedValueOnce(new Error("Network error"));

    const { getAuth } = renderWithAuth();
    await waitFor(() => expect(getAuth().isLoading).toBe(false));

    await act(async () => {
      await getAuth().login("test@mincom.com", "password123");
    });

    await act(async () => {
      await getAuth().logout();
    });

    // State should be cleared regardless of API failure
    expect(getAuth().isAuthenticated).toBe(false);
    expect(getAuth().user).toBeNull();
    expect(getAccessToken()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: useAuth() outside provider
// ---------------------------------------------------------------------------

describe("useAuth() outside AuthProvider", () => {
  it("throws a descriptive error", () => {
    function BadComponent() {
      useAuth();
      return null;
    }

    // Suppress React error boundary console output
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<BadComponent />)).toThrow(
      "useAuth must be used within an <AuthProvider>",
    );

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Session restore
// ---------------------------------------------------------------------------

describe("session restore", () => {
  it("restores user and isAuthenticated from refresh token on mount", async () => {
    // Pre-populate refresh token to simulate a session that needs restoring
    setRefreshToken("existing-refresh-token");

    // The shared helper handles the refresh and persists new tokens.
    mockRefreshTokenWithLock.mockImplementationOnce(async () => {
      setAccessToken(testAccessToken);
      setRefreshToken("new-refresh-token");
      return { access: testAccessToken, refresh: "new-refresh-token" };
    });

    const { getAuth } = renderWithAuth();

    await waitFor(() => expect(getAuth().isLoading).toBe(false));

    expect(getAuth().isAuthenticated).toBe(true);
    expect(getAuth().user).not.toBeNull();
    expect(getAuth().user?.id).toBe(testUser.id);
    expect(getAuth().user?.email).toBe(testUser.email);
  });

  it("resets to unauthenticated if refresh fails", async () => {
    setRefreshToken("expired-refresh-token");

    mockRefreshTokenWithLock.mockRejectedValueOnce({
      response: { status: 401 },
    });

    const { getAuth } = renderWithAuth();

    await waitFor(() => expect(getAuth().isLoading).toBe(false));

    expect(getAuth().isAuthenticated).toBe(false);
    expect(getAuth().user).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: extractErrorMessage
// ---------------------------------------------------------------------------

describe("extractErrorMessage()", () => {
  it("extracts message from API error envelope", () => {
    const error = {
      response: {
        data: {
          data: { message: "Account locked" },
        },
      },
    };
    expect(extractErrorMessage(error)).toBe("Account locked");
  });

  it("returns generic message for Error objects (does not leak internals)", () => {
    expect(extractErrorMessage(new Error("TypeError: cannot read x"))).toBe(
      "An unexpected error occurred. Please try again.",
    );
  });

  it("returns generic message for unknown error shapes", () => {
    expect(extractErrorMessage("string error")).toBe(
      "An unexpected error occurred. Please try again.",
    );
    expect(extractErrorMessage(null)).toBe(
      "An unexpected error occurred. Please try again.",
    );
    expect(extractErrorMessage(42)).toBe(
      "An unexpected error occurred. Please try again.",
    );
  });
});

// ---------------------------------------------------------------------------
// Test Suite: decodeUserFromToken
// ---------------------------------------------------------------------------

describe("decodeUserFromToken()", () => {
  it("decodes a valid JWT with user claims", () => {
    const token = fakeJwt({
      user_id: "u-123",
      email: "admin@mincom.com",
      roles: ["HR_ADMIN", "EMPLOYEE"],
      is_mfa_enabled: true,
      exp: Math.floor(Date.now() / 1000) + 900,
    });

    const user = decodeUserFromToken(token);
    expect(user).toEqual({
      id: "u-123",
      email: "admin@mincom.com",
      roles: ["HR_ADMIN", "EMPLOYEE"],
      is_mfa_enabled: true,
      employee_id: null,
      must_change_password: false,
    });
  });

  it("returns null for an invalid token", () => {
    expect(decodeUserFromToken("not-a-jwt")).toBeNull();
  });

  it("filters out invalid roles", () => {
    const token = fakeJwt({
      user_id: "u-456",
      email: "user@mincom.com",
      roles: ["EMPLOYEE", "INVALID_ROLE", "MANAGER"],
      exp: Math.floor(Date.now() / 1000) + 900,
    });

    const user = decodeUserFromToken(token);
    expect(user?.roles).toEqual(["EMPLOYEE", "MANAGER"]);
  });

  it("returns must_change_password=true when the JWT claim is true", () => {
    const token = fakeJwt({
      user_id: "u-789",
      email: "user@mincom.com",
      roles: ["EMPLOYEE"],
      is_mfa_enabled: false,
      must_change_password: true,
      exp: Math.floor(Date.now() / 1000) + 900,
    });

    const user = decodeUserFromToken(token);
    expect(user?.must_change_password).toBe(true);
  });

  it("returns must_change_password=false when the JWT claim is false", () => {
    const token = fakeJwt({
      user_id: "u-789",
      email: "user@mincom.com",
      roles: ["EMPLOYEE"],
      is_mfa_enabled: false,
      must_change_password: false,
      exp: Math.floor(Date.now() / 1000) + 900,
    });

    const user = decodeUserFromToken(token);
    expect(user?.must_change_password).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test Suite: accessToken in context
// ---------------------------------------------------------------------------

describe("accessToken in context", () => {
  it("exposes accessToken as null when unauthenticated", async () => {
    const { getAuth } = renderWithAuth();
    await waitFor(() => expect(getAuth().isLoading).toBe(false));

    expect(getAuth().accessToken).toBeNull();
  });

  it("exposes accessToken after login", async () => {
    apiClient.post.mockResolvedValueOnce({
      data: {
        access: testAccessToken,
        refresh: testRefreshToken,
        user: testUser,
      },
    });

    const { getAuth } = renderWithAuth();
    await waitFor(() => expect(getAuth().isLoading).toBe(false));

    await act(async () => {
      await getAuth().login("test@mincom.com", "password123");
    });

    expect(getAuth().accessToken).toBe(testAccessToken);
  });
});

// ---------------------------------------------------------------------------
// Test Suite: isLoading initial state
// ---------------------------------------------------------------------------

describe("isLoading initial state", () => {
  it("is true synchronously on initial render before session restore completes", () => {
    // Pre-populate refresh token so restoreSession will attempt an API call
    setRefreshToken("existing-refresh-token");

    // Use a never-resolving promise so restoreSession stays pending
    mockRefreshTokenWithLock.mockReturnValueOnce(new Promise(() => {}));

    let capturedIsLoading: boolean | undefined;

    function Spy() {
      const auth = useAuth();
      // Capture only on first render
      if (capturedIsLoading === undefined) {
        capturedIsLoading = auth.isLoading;
      }
      return null;
    }

    render(
      <AuthProvider>
        <Spy />
      </AuthProvider>,
    );

    // Synchronously after render, isLoading should be true
    expect(capturedIsLoading).toBe(true);
  });
});
