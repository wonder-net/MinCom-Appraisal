/**
 * Tests for ForgotPasswordPage.
 *
 * Covers:
 * - Renders email input and submit button
 * - Valid email submission calls requestPasswordReset and shows confirmation
 * - Empty/invalid email shows validation error, does not call API
 * - API error (500) still shows the same confirmation message
 * - Authenticated user is redirected to /appraisals
 * - "Forgot password?" link renders in LoginForm and points to /forgot-password
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthContext } from "@/auth/AuthContext";
import type { AuthContextType, User } from "@/auth/types";
import ForgotPasswordPage from "../pages/ForgotPasswordPage";
import { LoginForm } from "@/auth/components/LoginForm";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequestPasswordReset = vi.fn();

vi.mock("@/api/auth-api", () => ({
  requestPasswordReset: (...args: unknown[]) =>
    mockRequestPasswordReset(...args),
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

function renderPage(auth?: AuthContextType) {
  const authCtx = auth ?? buildAuth();
  return render(
    <AuthContext.Provider value={authCtx}>
      <MemoryRouter initialEntries={["/forgot-password"]}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route
            path="/appraisals"
            element={<div data-testid="appraisals-page">Appraisals</div>}
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequestPasswordReset.mockResolvedValue(undefined);
  });

  it("renders email input and submit button", () => {
    renderPage();

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /send reset link/i }),
    ).toBeInTheDocument();
  });

  it("renders heading and description text", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: /reset your password/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/enter your email and we'll send you a reset link/i),
    ).toBeInTheDocument();
  });

  it("renders 'Back to sign in' link pointing to /login", () => {
    renderPage();

    const link = screen.getByRole("link", { name: /back to sign in/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/login");
  });

  it("submitting with valid email calls API and shows confirmation", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email address/i), "user@mincom.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(mockRequestPasswordReset).toHaveBeenCalledWith("user@mincom.com");
    });

    expect(
      screen.getByText(/if that email is registered/i),
    ).toBeInTheDocument();
  });

  it("submitting with empty email shows validation error, does not call API", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(screen.getByText("Email is required.")).toBeInTheDocument();
    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
  });

  it("submitting with invalid email shows validation error, does not call API", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email address/i), "not-an-email");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(
      screen.getByText("Please enter a valid email address."),
    ).toBeInTheDocument();
    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
  });

  it("API error (500) still shows the same confirmation message", async () => {
    mockRequestPasswordReset.mockRejectedValueOnce(new Error("Server error"));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email address/i), "user@mincom.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/if that email is registered/i),
      ).toBeInTheDocument();
    });
  });

  it("shows loading state while request is in flight", async () => {
    let resolveRequest: () => void;
    mockRequestPasswordReset.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email address/i), "user@mincom.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(
      screen.getByRole("button", { name: /sending reset link, please wait/i }),
    ).toBeDisabled();

    resolveRequest!();
  });

  it("authenticated user is redirected to /appraisals", () => {
    const auth = buildAuth({
      user: baseUser,
      isAuthenticated: true,
      accessToken: "fake-token",
    });

    renderPage(auth);

    expect(screen.getByTestId("appraisals-page")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// LoginForm — "Forgot password?" link
// ---------------------------------------------------------------------------

describe("LoginForm — Forgot password link", () => {
  it("renders 'Forgot password?' link pointing to /forgot-password", () => {
    render(
      <MemoryRouter>
        <LoginForm
          onSubmit={vi.fn().mockResolvedValue(undefined)}
          isLoading={false}
          error={null}
          captchaRequired={false}
          lockoutSeconds={null}
        />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: /forgot password/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/forgot-password");
  });
});
