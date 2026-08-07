/**
 * Unit tests for the shared single-flight token refresh helper.
 *
 * Verifies:
 * - A single call returns tokens, persists them, and clears the lock.
 * - Concurrent calls share one promise → exactly one network request,
 *   all callers receive the same resolved value.
 * - An in-flight refresh that fails rejects all queued callers and
 *   clears the lock so the next call can start fresh.
 * - With no stored refresh token, returns null synchronously without
 *   making a network request.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock auth-api so we control the refresh API behaviour
// ---------------------------------------------------------------------------

const mockRefreshTokenApi =
  vi.fn<(refreshToken: string) => Promise<{ access: string; refresh: string }>>();

vi.mock("@/api/auth-api", () => ({
  refreshTokenApi: (refreshToken: string) => mockRefreshTokenApi(refreshToken),
}));

// ---------------------------------------------------------------------------
// Imports AFTER mocks are registered
// ---------------------------------------------------------------------------

import {
  refreshTokenWithLock,
  _resetRefreshLock,
} from "../refresh-with-lock";
import {
  clearTokens,
  setRefreshToken,
  getAccessToken,
  getRefreshToken,
} from "../token-store";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearTokens();
  _resetRefreshLock();
  mockRefreshTokenApi.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("refreshTokenWithLock", () => {
  it("performs one refresh, persists tokens, and clears the lock", async () => {
    setRefreshToken("rt-1");
    mockRefreshTokenApi.mockResolvedValueOnce({
      access: "new-access",
      refresh: "new-refresh",
    });

    const result = await refreshTokenWithLock();

    expect(result).toEqual({ access: "new-access", refresh: "new-refresh" });
    expect(mockRefreshTokenApi).toHaveBeenCalledTimes(1);
    expect(mockRefreshTokenApi).toHaveBeenCalledWith("rt-1");
    expect(getAccessToken()).toBe("new-access");
    expect(getRefreshToken()).toBe("new-refresh");

    // After completion the lock must be cleared so a subsequent
    // independent call can proceed.
    setRefreshToken("rt-2");
    mockRefreshTokenApi.mockResolvedValueOnce({
      access: "next-access",
      refresh: "next-refresh",
    });
    const second = await refreshTokenWithLock();
    expect(second).toEqual({ access: "next-access", refresh: "next-refresh" });
    expect(mockRefreshTokenApi).toHaveBeenCalledTimes(2);
  });

  it("shares one network request across concurrent callers", async () => {
    setRefreshToken("rt-1");

    // Deferred promise so we can verify the lock state mid-flight.
    let resolveRefresh!: (value: { access: string; refresh: string }) => void;
    mockRefreshTokenApi.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    // Three callers fire concurrently before the refresh resolves.
    const p1 = refreshTokenWithLock();
    const p2 = refreshTokenWithLock();
    const p3 = refreshTokenWithLock();

    resolveRefresh({ access: "shared-access", refresh: "shared-refresh" });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    // All three callers received the same resolved value
    expect(r1).toEqual({ access: "shared-access", refresh: "shared-refresh" });
    expect(r2).toEqual({ access: "shared-access", refresh: "shared-refresh" });
    expect(r3).toEqual({ access: "shared-access", refresh: "shared-refresh" });

    // Exactly ONE network call was made
    expect(mockRefreshTokenApi).toHaveBeenCalledTimes(1);

    // Tokens persisted exactly once
    expect(getAccessToken()).toBe("shared-access");
    expect(getRefreshToken()).toBe("shared-refresh");
  });

  it("rejects all queued callers when the refresh fails and clears the lock", async () => {
    setRefreshToken("rt-1");

    let rejectRefresh!: (error: unknown) => void;
    mockRefreshTokenApi.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectRefresh = reject;
      }),
    );

    const p1 = refreshTokenWithLock();
    const p2 = refreshTokenWithLock();
    const p3 = refreshTokenWithLock();

    const failure = new Error("token blacklisted");
    rejectRefresh(failure);

    // Use allSettled because all three should reject with the same error
    const results = await Promise.allSettled([p1, p2, p3]);
    for (const r of results) {
      expect(r.status).toBe("rejected");
      if (r.status === "rejected") {
        expect(r.reason).toBe(failure);
      }
    }

    // The lock must be cleared after failure so a subsequent call can
    // start a fresh refresh attempt rather than getting the cached
    // rejected promise.
    setRefreshToken("rt-2");
    mockRefreshTokenApi.mockResolvedValueOnce({
      access: "recovered-access",
      refresh: "recovered-refresh",
    });
    const recovered = await refreshTokenWithLock();
    expect(recovered).toEqual({
      access: "recovered-access",
      refresh: "recovered-refresh",
    });
    // Two network calls total: the failed one + the recovered one
    expect(mockRefreshTokenApi).toHaveBeenCalledTimes(2);
  });

  it("returns null without making a network request when no refresh token is stored", async () => {
    // clearTokens() in beforeEach already removed any refresh token
    const result = await refreshTokenWithLock();

    expect(result).toBeNull();
    expect(mockRefreshTokenApi).not.toHaveBeenCalled();
    // No tokens persisted, no lock taken
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });
});
