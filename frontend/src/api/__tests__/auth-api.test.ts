/**
 * Unit tests for auth-api functions.
 *
 * These tests verify that each auth-api function calls the correct HTTP
 * method, URL, and payload on the standalone authClient (which has no
 * interceptors). We mock axios.create to return a controlled mock client.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AxiosInstance } from "axios";

// ---------------------------------------------------------------------------
// Mock axios.create so authClient becomes our controlled mock.
// vi.hoisted ensures mockPost is initialised before vi.mock is hoisted.
// ---------------------------------------------------------------------------

const { mockPost } = vi.hoisted(() => ({
  mockPost: vi.fn(),
}));

vi.mock("axios", async () => {
  const actual = await vi.importActual<typeof import("axios")>("axios");
  return {
    ...actual,
    default: {
      ...actual.default,
      create: (): Partial<AxiosInstance> => ({
        post: mockPost,
        defaults: { headers: {} } as AxiosInstance["defaults"],
      }),
    },
  };
});

// ---------------------------------------------------------------------------
// Import AFTER mocks are registered
// ---------------------------------------------------------------------------

import {
  loginApi,
  refreshTokenApi,
  logoutApi,
  verifyMFAApi,
  changePasswordApi,
  mfaSetupApi,
} from "../auth-api";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockPost.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Auth API functions", () => {
  describe("loginApi", () => {
    it("sends POST to auth/login/ with identifier, password, and captcha token", async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          status: "success",
          data: { access: "a", refresh: "r", user: { id: "1" } },
        },
      });

      const result = await loginApi("user@example.com", "secret123", "captcha-tok");

      expect(mockPost).toHaveBeenCalledWith("auth/login/", {
        identifier: "user@example.com",
        password: "secret123",
        captcha_token: "captcha-tok",
      });
      expect(result).toEqual({
        status: "success",
        data: { access: "a", refresh: "r", user: { id: "1" } },
      });
    });

    it("omits captcha_token when not provided", async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          status: "success",
          data: { access: "a", refresh: "r", user: { id: "1" } },
        },
      });

      await loginApi("user@example.com", "secret123");

      expect(mockPost).toHaveBeenCalledWith("auth/login/", {
        identifier: "user@example.com",
        password: "secret123",
      });
    });

    it("sends an employee number as the identifier (not just email)", async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          status: "success",
          data: { access: "a", refresh: "r", user: { id: "1" } },
        },
      });

      await loginApi("MIN1234", "secret123");

      expect(mockPost).toHaveBeenCalledWith("auth/login/", {
        identifier: "MIN1234",
        password: "secret123",
      });
    });
  });

  describe("refreshTokenApi", () => {
    it("sends POST to auth/token/refresh/ and returns data.data", async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          status: "success",
          data: { access: "new-a", refresh: "new-r" },
        },
      });

      const result = await refreshTokenApi("my-refresh");

      expect(mockPost).toHaveBeenCalledWith("auth/token/refresh/", {
        refresh: "my-refresh",
      });
      expect(result).toEqual({ access: "new-a", refresh: "new-r" });
    });
  });

  describe("logoutApi", () => {
    it("sends POST to auth/logout/ with refresh token", async () => {
      mockPost.mockResolvedValueOnce({ data: {} });

      await logoutApi("refresh-to-revoke");

      expect(mockPost).toHaveBeenCalledWith("auth/logout/", {
        refresh: "refresh-to-revoke",
      });
    });
  });

  describe("verifyMFAApi", () => {
    it("sends POST to auth/mfa/verify-login/ with mfa_token and code", async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          status: "success",
          data: { access: "a", refresh: "r", user: { id: "1" } },
        },
      });

      const result = await verifyMFAApi("mfa-session-token", "123456");

      expect(mockPost).toHaveBeenCalledWith("auth/mfa/verify-login/", {
        mfa_token: "mfa-session-token",
        code: "123456",
      });
      expect(result).toEqual({
        status: "success",
        data: { access: "a", refresh: "r", user: { id: "1" } },
      });
    });

    it("sends recovery_code instead of code when isRecoveryCode is true", async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          status: "success",
          data: { access: "a", refresh: "r", user: { id: "1" } },
        },
      });

      const result = await verifyMFAApi("mfa-session-token", "ABCD-EFGH-IJKL", true);

      expect(mockPost).toHaveBeenCalledWith("auth/mfa/verify-login/", {
        mfa_token: "mfa-session-token",
        recovery_code: "ABCD-EFGH-IJKL",
      });
      expect(result).toEqual({
        status: "success",
        data: { access: "a", refresh: "r", user: { id: "1" } },
      });
    });
  });

  describe("changePasswordApi", () => {
    it("sends POST with Authorization header to auth/password/change/", async () => {
      mockPost.mockResolvedValueOnce({ data: {} });

      await changePasswordApi("oldPwd", "newPwd", "newPwd", "my-access-token");

      expect(mockPost).toHaveBeenCalledWith(
        "auth/password/change/",
        {
          old_password: "oldPwd",
          new_password: "newPwd",
          confirm_password: "newPwd",
        },
        { headers: { Authorization: "Bearer my-access-token" } },
      );
    });
  });

  describe("mfaSetupApi", () => {
    it("sends POST with Authorization header to auth/mfa/setup/", async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          status: "success",
          data: { secret: "ABCD1234", qr_code: "data:image/png;base64,..." },
        },
      });

      const result = await mfaSetupApi("my-access-token");

      expect(mockPost).toHaveBeenCalledWith(
        "auth/mfa/setup/",
        {},
        { headers: { Authorization: "Bearer my-access-token" } },
      );
      expect(result).toEqual({
        status: "success",
        data: { secret: "ABCD1234", qr_code: "data:image/png;base64,..." },
      });
    });
  });
});
