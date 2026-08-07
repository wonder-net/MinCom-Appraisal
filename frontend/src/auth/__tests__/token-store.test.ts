/**
 * Unit tests for token-store.ts — Remember Me storage switching.
 *
 * Covers: setRefreshToken routing, getRefreshToken fallback order,
 * clearTokens cleanup, and setRememberMe round-trip.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  setRefreshToken,
  getRefreshToken,
  clearTokens,
  setRememberMe,
  getRememberMe,
} from "../token-store";

// ---------------------------------------------------------------------------
// Setup — clear all storage before each test to ensure isolation
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("token-store Remember Me", () => {
  it("setRefreshToken writes to sessionStorage when rememberMe is false", () => {
    setRememberMe(false);
    setRefreshToken("tok");

    expect(sessionStorage.getItem("mincom_rt")).toBe("tok");
    expect(localStorage.getItem("mincom_rt")).toBeNull();
  });

  it("setRefreshToken writes to localStorage when rememberMe is true", () => {
    setRememberMe(true);
    setRefreshToken("tok");

    expect(localStorage.getItem("mincom_rt")).toBe("tok");
    expect(sessionStorage.getItem("mincom_rt")).toBeNull();
  });

  it("getRefreshToken reads from localStorage when token is there", () => {
    // Both storages have a token — localStorage should win
    localStorage.setItem("mincom_rt", "local-tok");
    sessionStorage.setItem("mincom_rt", "session-tok");

    expect(getRefreshToken()).toBe("local-tok");
  });

  it("getRefreshToken falls back to sessionStorage when localStorage is empty", () => {
    sessionStorage.setItem("mincom_rt", "session-tok");

    expect(getRefreshToken()).toBe("session-tok");
  });

  it("clearTokens removes key from both storages", () => {
    localStorage.setItem("mincom_rt", "local-tok");
    sessionStorage.setItem("mincom_rt", "session-tok");
    localStorage.setItem("mincom_remember", "true");

    clearTokens();

    expect(localStorage.getItem("mincom_rt")).toBeNull();
    expect(sessionStorage.getItem("mincom_rt")).toBeNull();
    expect(localStorage.getItem("mincom_remember")).toBeNull();
  });

  it("setRememberMe(false) then setRememberMe(true) round-trips correctly", () => {
    setRememberMe(false);
    expect(getRememberMe()).toBe(false);

    setRememberMe(true);
    expect(getRememberMe()).toBe(true);
  });
});
