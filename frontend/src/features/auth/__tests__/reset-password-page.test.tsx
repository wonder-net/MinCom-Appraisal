/**
 * Tests for ResetPasswordPage.
 *
 * Covers:
 * - Renders "invalid link" state when no ?token= query param present
 * - Renders password form when token is present in URL
 * - Submitting with passwords shorter than 8 characters shows validation error
 * - Submitting with mismatched passwords shows validation error
 * - Successful API call shows success message and link to /login
 * - API 400 error shows error message inline
 * - Authenticated user is redirected to /appraisals
 * - Submit button is disabled while request is in flight
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthContext } from "@/auth/AuthContext";
import type { AuthContextType, User } from "@/auth/types";
import ResetPasswordPage from "../pages/ResetPasswordPage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockConfirmPasswordReset = vi.fn();

vi.mock("@/api/auth-api", () => ({
  confirmPasswordReset: (...args: unknown[]) =>
    mockConfirmPasswordReset(...args),
}));

vi.mock("@/utils/extract-api-error", () => ({
  extractApiError: (err: unknown) => {
    if (err instanceof Error) return err.message;
    return "An unexpected error occurred. Please try again.";
  },
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
    user: null,
    isAuthenticated: false,
    isLoading: false,
    mfaSetupRequired: true,
    accessToken: null,
    login: vi.fn().mockResolvedValue({ success: true }),
    verifyMFA: vi.fn().mockResolvedValue({ success: true }),
    logout: vi.fn().mockResolvedValue(undefined),
    refreshSession: vi.fn().mockResolvedValue(undefined),
    updateUser: vi.fn(),
    ...overrides,
  };
}

function renderPage(initialPath: string, auth?: AuthContextType) {
  const authCtx = auth ?? buildAuth();
  return render(
    <AuthContext.Provider value={authCtx}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfirmPasswordReset.mockResolvedValue(undefined);
  });

  it("renders 'invalid link' state when no token query param", () => {
    renderPage("/reset-password");

    expect(
      screen.getByText(/this reset link is invalid or has expired/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /request a new reset link/i }),
    ).toHaveAttribute("href", "/forgot-password");
  });

  it("renders password form when token is present", () => {
    renderPage("/reset-password?token=abc123");

    expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reset password/i }),
    ).toBeInTheDocument();
  });

  it("renders heading", () => {
    renderPage("/reset-password?token=abc123");

    expect(
      screen.getByRole("heading", { name: /set a new password/i }),
    ).toBeInTheDocument();
  });

  it("submitting with short password shows validation error, does not call API", async () => {
    const user = userEvent.setup();
    renderPage("/reset-password?token=abc123");

    await user.type(screen.getByLabelText(/^new password/i), "short");
    await user.type(screen.getByLabelText(/confirm new password/i), "short");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    expect(
      screen.getByText(/password must be at least 8 characters/i),
    ).toBeInTheDocument();
    expect(mockConfirmPasswordReset).not.toHaveBeenCalled();
  });

  it("submitting with mismatched passwords shows validation error, does not call API", async () => {
    const user = userEvent.setup();
    renderPage("/reset-password?token=abc123");

    await user.type(
      screen.getByLabelText(/^new password/i),
      "SecurePassword123",
    );
    await user.type(
      screen.getByLabelText(/confirm new password/i),
      "DifferentPassword123",
    );
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    expect(mockConfirmPasswordReset).not.toHaveBeenCalled();
  });

  it("submitting with empty passwords shows validation errors", async () => {
    const user = userEvent.setup();
    renderPage("/reset-password?token=abc123");

    await user.click(screen.getByRole("button", { name: /reset password/i }));

    expect(screen.getByText("Password is required.")).toBeInTheDocument();
    expect(
      screen.getByText("Please confirm your password."),
    ).toBeInTheDocument();
    expect(mockConfirmPasswordReset).not.toHaveBeenCalled();
  });

  it("successful API call shows success message and link to /login", async () => {
    const user = userEvent.setup();
    renderPage("/reset-password?token=valid-token");

    await user.type(
      screen.getByLabelText(/^new password/i),
      "NewSecurePass12!",
    );
    await user.type(
      screen.getByLabelText(/confirm new password/i),
      "NewSecurePass12!",
    );
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(mockConfirmPasswordReset).toHaveBeenCalledWith(
        "valid-token",
        "NewSecurePass12!",
        "NewSecurePass12!",
      );
    });

    expect(
      screen.getByText(/password reset successfully/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /go to sign in/i }),
    ).toHaveAttribute("href", "/login");
  });

  it("API 400 error shows error message inline and form stays usable", async () => {
    mockConfirmPasswordReset.mockRejectedValueOnce(
      new Error("This reset link has expired."),
    );
    const user = userEvent.setup();
    renderPage("/reset-password?token=expired-token");

    await user.type(
      screen.getByLabelText(/^new password/i),
      "NewSecurePass12!",
    );
    await user.type(
      screen.getByLabelText(/confirm new password/i),
      "NewSecurePass12!",
    );
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(
        screen.getByText("This reset link has expired."),
      ).toBeInTheDocument();
    });

    // Form is still usable (submit button still present)
    expect(
      screen.getByRole("button", { name: /reset password/i }),
    ).toBeEnabled();
  });

  it("authenticated user is redirected to /appraisals", () => {
    const auth = buildAuth({
      user: baseUser,
      isAuthenticated: true,
      accessToken: "fake-token",
    });

    renderPage("/reset-password?token=abc123", auth);

    expect(screen.getByTestId("appraisals-page")).toBeInTheDocument();
  });

  it("submit button is disabled while request is in flight", async () => {
    let resolveRequest: () => void;
    mockConfirmPasswordReset.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const user = userEvent.setup();
    renderPage("/reset-password?token=abc123");

    await user.type(
      screen.getByLabelText(/^new password/i),
      "NewSecurePass12!",
    );
    await user.type(
      screen.getByLabelText(/confirm new password/i),
      "NewSecurePass12!",
    );
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    expect(
      screen.getByRole("button", { name: /resetting password, please wait/i }),
    ).toBeDisabled();

    resolveRequest!();
  });

  it("password visibility toggles work", async () => {
    const user = userEvent.setup();
    renderPage("/reset-password?token=abc123");

    const passwordInput = screen.getByLabelText(/^new password/i);
    const confirmInput = screen.getByLabelText(/confirm new password/i);

    expect(passwordInput).toHaveAttribute("type", "password");
    expect(confirmInput).toHaveAttribute("type", "password");

    await user.click(screen.getByLabelText("Show password"));
    expect(passwordInput).toHaveAttribute("type", "text");

    await user.click(screen.getByLabelText("Show confirm password"));
    expect(confirmInput).toHaveAttribute("type", "text");

    await user.click(screen.getByLabelText("Hide password"));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("does not show password strength indicator before typing", () => {
    renderPage("/reset-password?token=abc123");

    expect(
      screen.queryByRole("list", { name: /password requirements/i }),
    ).not.toBeInTheDocument();
  });

  it("shows all requirements as met when a valid 8+ char mixed password is typed", async () => {
    const user = userEvent.setup();
    renderPage("/reset-password?token=abc123");

    await user.type(screen.getByLabelText(/^new password/i), "ValidP4ss!xyz");

    const items = screen.getAllByRole("listitem");
    const lengthReq = items.find((li) =>
      li.textContent?.includes("At least 8 characters"),
    );
    const notNumericReq = items.find((li) =>
      li.textContent?.includes("Not entirely numeric"),
    );
    const specialCharReq = items.find((li) =>
      li.textContent?.includes("At least one special character"),
    );

    expect(lengthReq).toBeDefined();
    expect(lengthReq?.className).toContain("text-green-700");
    expect(notNumericReq).toBeDefined();
    expect(notNumericReq?.className).toContain("text-green-700");
    expect(specialCharReq).toBeDefined();
    expect(specialCharReq?.className).toContain("text-green-700");
  });

  it("shows length as unmet, not-numeric as met, and special-char as unmet when 'short' is typed", async () => {
    const user = userEvent.setup();
    renderPage("/reset-password?token=abc123");

    await user.type(screen.getByLabelText(/^new password/i), "short");

    const items = screen.getAllByRole("listitem");
    const lengthReq = items.find((li) =>
      li.textContent?.includes("At least 8 characters"),
    );
    const notNumericReq = items.find((li) =>
      li.textContent?.includes("Not entirely numeric"),
    );
    const specialCharReq = items.find((li) =>
      li.textContent?.includes("At least one special character"),
    );

    // "short" is under 8 chars — length requirement unmet
    expect(lengthReq).toBeDefined();
    expect(lengthReq?.className).toContain("text-gray-500");
    // "short" contains letters — not-numeric requirement is met
    expect(notNumericReq).toBeDefined();
    expect(notNumericReq?.className).toContain("text-green-700");
    // "short" has no special characters — special-char requirement is unmet
    expect(specialCharReq).toBeDefined();
    expect(specialCharReq?.className).toContain("text-gray-500");
  });
});
