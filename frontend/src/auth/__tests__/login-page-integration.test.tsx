/**
 * Integration tests for LoginPage — step transitions and navigation.
 *
 * Verifies that LoginPage correctly transitions between credentials
 * and MFA steps based on login results, and redirects on success.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthContext } from "../AuthContext";
import type { AuthContextType, LoginResult, MfaVerifyResult } from "../types";
import LoginPage from "../LoginPage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockAuth(
  overrides: Partial<AuthContextType> = {},
): AuthContextType {
  return {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    mfaSetupRequired: true,
    accessToken: null,
    login: vi.fn().mockResolvedValue({ success: true } satisfies LoginResult),
    verifyMFA: vi.fn().mockResolvedValue({ success: true } satisfies MfaVerifyResult),
    logout: vi.fn().mockResolvedValue(undefined),
    refreshSession: vi.fn().mockResolvedValue(undefined),
    updateUser: vi.fn(),
    ...overrides,
  } as AuthContextType;
}

function AppraisalsStub() {
  return <div data-testid="appraisals-page">Appraisals</div>;
}

function renderLoginPage(auth: AuthContextType) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/appraisals" element={<AppraisalsStub />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("transitions from login form to MFA form on mfa_required response", async () => {
    const mockAuth = createMockAuth({
      login: vi.fn().mockResolvedValue({
        success: false,
        mfaRequired: true,
        mfaToken: "mfa-token-xyz",
      }),
    });

    renderLoginPage(mockAuth);

    // Fill in credentials
    await userEvent.type(
      screen.getByLabelText(/email or PF number/i),
      "user@mincom.com",
    );
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    // Should now show MFA step
    await waitFor(() => {
      expect(
        screen.getByText(/two-factor authentication/i),
      ).toBeInTheDocument();
    });

    // Login form should be gone
    expect(screen.queryByLabelText(/email or PF number/i)).not.toBeInTheDocument();
  });

  it("redirects to /appraisals on successful authentication", async () => {
    const mockAuth = createMockAuth({
      login: vi.fn().mockResolvedValue({ success: true }),
    });

    renderLoginPage(mockAuth);

    await userEvent.type(
      screen.getByLabelText(/email or PF number/i),
      "user@mincom.com",
    );
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByTestId("appraisals-page")).toBeInTheDocument();
    });
  });

  it("redirects already-authenticated users to /appraisals", async () => {
    const mockAuth = createMockAuth({ isAuthenticated: true });

    renderLoginPage(mockAuth);

    await waitFor(() => {
      expect(screen.getByTestId("appraisals-page")).toBeInTheDocument();
    });
  });

  it("displays error message on failed login", async () => {
    const mockAuth = createMockAuth({
      login: vi.fn().mockResolvedValue({
        success: false,
        error: "Invalid email or password.",
      }),
    });

    renderLoginPage(mockAuth);

    await userEvent.type(
      screen.getByLabelText(/email or PF number/i),
      "bad@mincom.com",
    );
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "wrongpass");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("Invalid email or password.")).toBeInTheDocument();
    });
  });

  it("passes rememberMe=true to login when checkbox is checked", async () => {
    const mockLogin = vi.fn().mockResolvedValue({ success: true });
    const mockAuth = createMockAuth({ login: mockLogin });

    renderLoginPage(mockAuth);

    const checkbox = screen.getByRole("checkbox", {
      name: /keep me signed in/i,
    });
    await userEvent.click(checkbox);

    await userEvent.type(
      screen.getByLabelText(/email or PF number/i),
      "user@mincom.com",
    );
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        "user@mincom.com",
        "password123",
        undefined,
        true,
      );
    });
  });

  it("passes rememberMe=false to login when checkbox is unchecked", async () => {
    const mockLogin = vi.fn().mockResolvedValue({ success: true });
    const mockAuth = createMockAuth({ login: mockLogin });

    renderLoginPage(mockAuth);

    await userEvent.type(
      screen.getByLabelText(/email or PF number/i),
      "user@mincom.com",
    );
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        "user@mincom.com",
        "password123",
        undefined,
        false,
      );
    });
  });

  it("rememberMe survives to MFA verifyMFA call", async () => {
    const mockLogin = vi.fn().mockResolvedValue({
      success: false,
      mfaRequired: true,
      mfaToken: "mfa-token-xyz",
    });
    const mockVerifyMFA = vi.fn().mockResolvedValue({ success: true });
    const mockAuth = createMockAuth({
      login: mockLogin,
      verifyMFA: mockVerifyMFA,
    });

    renderLoginPage(mockAuth);

    // Check the Remember Me checkbox
    const checkbox = screen.getByRole("checkbox", {
      name: /keep me signed in/i,
    });
    await userEvent.click(checkbox);

    // Submit credentials
    await userEvent.type(
      screen.getByLabelText(/email or PF number/i),
      "user@mincom.com",
    );
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    // Should transition to MFA step
    await waitFor(() => {
      expect(
        screen.getByText(/two-factor authentication/i),
      ).toBeInTheDocument();
    });

    // Submit MFA code
    const mfaInput = screen.getByLabelText(/6-digit verification code/i);
    await userEvent.type(mfaInput, "123456");
    await userEvent.click(screen.getByRole("button", { name: /verify code/i }));

    await waitFor(() => {
      expect(mockVerifyMFA).toHaveBeenCalledWith(
        "mfa-token-xyz",
        "123456",
        false,
        true,
      );
    });
  });

  it("displays the SPA-only friendly message when login returns NO_SPA_ROLES_ASSIGNED", async () => {
    const mockAuth = createMockAuth({
      login: vi.fn().mockResolvedValue({
        success: false,
        error:
          "This account does not have access to the application. " +
          "If you are a system administrator, sign in at /admin.",
        errorCode: "NO_SPA_ROLES_ASSIGNED",
      } satisfies LoginResult),
    });

    renderLoginPage(mockAuth);

    await userEvent.type(
      screen.getByLabelText(/email or PF number/i),
      "superuser@mincom.test",
    );
    await userEvent.type(
      screen.getByPlaceholderText("••••••••"),
      "SuperSecure123!Pass",
    );
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          /reserved for system administration\. Please sign in at \/admin\./i,
        ),
      ).toBeInTheDocument();
    });

    // Should NOT have transitioned to MFA step or redirected.
    expect(screen.queryByTestId("appraisals-page")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/two-factor authentication/i),
    ).not.toBeInTheDocument();
    // Login form is still visible.
    expect(screen.getByLabelText(/email or PF number/i)).toBeInTheDocument();
  });

  it("logs out (does not redirect) when an authenticated user with must_change_password lands on /login via back button", async () => {
    // Simulates the bug-fix scenario: user completed credentials + MFA but
    // still owes a forced password change.  They use the browser back button
    // from /change-password to escape to /login.  The mount-time effect in
    // LoginPage must abandon the half-finished session by calling logout(),
    // and must NOT silently navigate them back to /appraisals.
    const mockLogout = vi.fn().mockResolvedValue(undefined);
    const mockAuth = createMockAuth({
      isAuthenticated: true,
      mfaSetupRequired: false,
      user: {
        id: "u-001",
        email: "user@mincom.com",
        roles: ["EMPLOYEE"],
        is_mfa_enabled: true,
        employee_id: null,
        must_change_password: true,
      },
      logout: mockLogout,
    });

    renderLoginPage(mockAuth);

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });

    // Must NOT have navigated to /appraisals.  AppraisalsStub renders only
    // when the navigate call lands on that route, so its absence proves the
    // redirect branch was skipped.
    expect(screen.queryByTestId("appraisals-page")).not.toBeInTheDocument();
  });

  it("redirects to redirectTo when an already-authenticated user with no incomplete steps lands on /login", async () => {
    // Inverse of the back-button case: user is fully signed in (MFA done,
    // no forced password change).  Mount-time effect should navigate them
    // to /appraisals and MUST NOT call logout().
    const mockLogout = vi.fn().mockResolvedValue(undefined);
    const mockAuth = createMockAuth({
      isAuthenticated: true,
      mfaSetupRequired: false,
      user: {
        id: "u-001",
        email: "user@mincom.com",
        roles: ["EMPLOYEE"],
        is_mfa_enabled: true,
        employee_id: null,
        must_change_password: false,
      },
      logout: mockLogout,
    });

    renderLoginPage(mockAuth);

    await waitFor(() => {
      expect(screen.getByTestId("appraisals-page")).toBeInTheDocument();
    });

    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("allows going back from MFA step to credentials step", async () => {
    const mockAuth = createMockAuth({
      login: vi.fn().mockResolvedValue({
        success: false,
        mfaRequired: true,
        mfaToken: "mfa-token-xyz",
      }),
    });

    renderLoginPage(mockAuth);

    // Trigger MFA step
    await userEvent.type(
      screen.getByLabelText(/email or PF number/i),
      "user@mincom.com",
    );
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/two-factor authentication/i),
      ).toBeInTheDocument();
    });

    // Click back
    await userEvent.click(
      screen.getByRole("button", { name: /back to login/i }),
    );

    // Should be back at credentials
    await waitFor(() => {
      expect(screen.getByLabelText(/email or PF number/i)).toBeInTheDocument();
    });
  });
});
