/**
 * Tests for MFASetupPage — recovery codes confirmation flow.
 *
 * Covers: updateUser called before navigate, redirect when MFA is already
 * enabled, retry on setup failure, and unauthenticated redirect.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthContext } from "../AuthContext";
import type { AuthContextType, User } from "../types";
import MFASetupPage from "../MFASetupPage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMfaSetupApi = vi.fn();
const mockMfaSetupConfirmApi = vi.fn();

vi.mock("@/api", () => ({
  mfaSetupApi: (...args: unknown[]) => mockMfaSetupApi(...args),
  mfaSetupConfirmApi: (...args: unknown[]) => mockMfaSetupConfirmApi(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseUser: User = {
  id: "u-001",
  email: "test@mincom.com",
  roles: ["EMPLOYEE"],
  is_mfa_enabled: false,
  employee_id: null,
  must_change_password: false,
};

function buildAuth(overrides: Partial<AuthContextType> = {}): AuthContextType {
  return {
    user: baseUser,
    isAuthenticated: true,
    isLoading: false,
    mfaSetupRequired: true,
    accessToken: "fake-access-token",
    login: vi.fn().mockResolvedValue({ success: true }),
    verifyMFA: vi.fn().mockResolvedValue({ success: true }),
    logout: vi.fn().mockResolvedValue(undefined),
    refreshSession: vi.fn().mockResolvedValue(undefined),
    updateUser: vi.fn(),
    ...overrides,
  };
}

function renderPage(auth: AuthContextType) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={["/mfa-setup"]}>
        <Routes>
          <Route path="/mfa-setup" element={<MFASetupPage />} />
          <Route
            path="/appraisals"
            element={<div data-testid="appraisals-page">Appraisals</div>}
          />
          <Route
            path="/login"
            element={<div data-testid="login-page">Login</div>}
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

/**
 * Drive the page from loading through QR, verify, and into recovery step.
 * Returns the auth context mock for assertions.
 */
async function advanceToRecoveryStep(
  authOverrides: Partial<AuthContextType> = {},
): Promise<AuthContextType> {
  const recoveryCodes = ["AAAA-1111", "BBBB-2222", "CCCC-3333", "DDDD-4444"];

  mockMfaSetupApi.mockResolvedValue({
    data: { provisioning_uri: "otpauth://totp/test", secret: "ABCDEF" },
  });
  mockMfaSetupConfirmApi.mockResolvedValue({
    data: { recovery_codes: recoveryCodes },
  });

  const auth = buildAuth(authOverrides);
  renderPage(auth);

  // Wait for QR step
  await waitFor(() => {
    expect(
      screen.getByText("Set Up Two-Factor Authentication"),
    ).toBeInTheDocument();
  });

  // Proceed to verify step
  await userEvent.click(
    screen.getByRole("button", { name: /i have scanned the qr code/i }),
  );

  // Enter TOTP code and verify
  const input = screen.getByLabelText(/6-digit verification code/i);
  await userEvent.type(input, "123456");
  await userEvent.click(
    screen.getByRole("button", { name: /verify and activate/i }),
  );

  // Wait for recovery codes step
  await waitFor(() => {
    expect(screen.getByText("Recovery Codes")).toBeInTheDocument();
  });

  return auth;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MFASetupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls updateUser with is_mfa_enabled before navigating after confirming recovery codes", async () => {
    const updateUser = vi.fn();
    const auth = await advanceToRecoveryStep({ updateUser });

    await userEvent.click(
      screen.getByRole("button", { name: /i have saved these codes/i }),
    );

    expect(auth.updateUser).toHaveBeenCalledOnce();
    expect(auth.updateUser).toHaveBeenCalledWith({ is_mfa_enabled: true });

    await waitFor(() => {
      expect(screen.getByTestId("appraisals-page")).toBeInTheDocument();
    });
  });

  it("redirects to /appraisals when MFA is already enabled (setup API error)", async () => {
    mockMfaSetupApi.mockRejectedValue({
      response: {
        data: {
          data: { message: "MFA is already enabled for this account." },
        },
      },
    });

    const auth = buildAuth();
    renderPage(auth);

    await waitFor(() => {
      expect(screen.getByTestId("appraisals-page")).toBeInTheDocument();
    });
  });

  it("redirects unauthenticated users to /login", async () => {
    mockMfaSetupApi.mockResolvedValue({
      data: { provisioning_uri: "otpauth://totp/test", secret: "ABCDEF" },
    });

    const auth = buildAuth({
      isAuthenticated: false,
      accessToken: null,
      user: null,
    });
    renderPage(auth);

    await waitFor(() => {
      expect(screen.getByTestId("login-page")).toBeInTheDocument();
    });
  });

  it("shows error step with retry and login buttons on generic setup API failure", async () => {
    mockMfaSetupApi.mockRejectedValue(new Error("Network error"));

    const auth = buildAuth();
    renderPage(auth);

    // Should show error step
    await waitFor(() => {
      expect(screen.getByText(/setup failed/i)).toBeInTheDocument();
    });

    // Should show retry and login buttons
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /return to login/i })).toBeInTheDocument();

    // Click "Try Again" — should call mfaSetupApi again
    mockMfaSetupApi.mockResolvedValue({
      data: { provisioning_uri: "otpauth://totp/retry", secret: "RETRYKEY" },
    });
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    // Should transition to QR step
    await waitFor(() => {
      expect(screen.getByText(/scan the qr code/i)).toBeInTheDocument();
    });
    expect(mockMfaSetupApi).toHaveBeenCalledTimes(2);
  });

  it("navigates to login when 'Return to Login' is clicked on error step", async () => {
    mockMfaSetupApi.mockRejectedValue(new Error("Network error"));

    const auth = buildAuth();
    renderPage(auth);

    await waitFor(() => {
      expect(screen.getByText(/setup failed/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /return to login/i }));

    await waitFor(() => {
      expect(screen.getByTestId("login-page")).toBeInTheDocument();
    });
  });

  it("shows 'Skip for now' button when mfaSetupRequired is false", async () => {
    mockMfaSetupApi.mockResolvedValue({
      data: { provisioning_uri: "otpauth://totp/test", secret: "ABCDEF" },
    });

    const auth = buildAuth({ mfaSetupRequired: false });
    renderPage(auth);

    await waitFor(() => {
      expect(
        screen.getByText("Set Up Two-Factor Authentication"),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /skip for now/i }),
    ).toBeInTheDocument();
  });

  it("does not show 'Skip for now' button when mfaSetupRequired is true", async () => {
    mockMfaSetupApi.mockResolvedValue({
      data: { provisioning_uri: "otpauth://totp/test", secret: "ABCDEF" },
    });

    const auth = buildAuth({ mfaSetupRequired: true });
    renderPage(auth);

    await waitFor(() => {
      expect(
        screen.getByText("Set Up Two-Factor Authentication"),
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("button", { name: /skip for now/i }),
    ).not.toBeInTheDocument();
  });
});
