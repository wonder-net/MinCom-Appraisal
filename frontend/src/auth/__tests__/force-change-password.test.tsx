/**
 * Tests for ForceChangePasswordPage and ProtectedRoute password gate.
 *
 * Covers:
 * - ProtectedRoute redirects to /change-password when must_change_password is true
 * - ProtectedRoute does NOT redirect when must_change_password is false
 * - ProtectedRoute does NOT redirect when already on /change-password
 * - ForceChangePasswordPage renders the mandatory banner with role="alert"
 * - ForceChangePasswordPage calls updateUser and navigates on success
 * - Integration: login with must_change_password lands on /change-password
 * - Integration: MFA verify with must_change_password lands on /change-password
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthContext } from "../AuthContext";
import { ProtectedRoute } from "../ProtectedRoute";
import ForceChangePasswordPage from "../ForceChangePasswordPage";
import type { AuthContextType, User } from "../types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockChangePasswordApi = vi.fn();

vi.mock("@/api", () => ({
  changePasswordApi: (...args: unknown[]) => mockChangePasswordApi(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseUser: User = {
  id: "u-001",
  email: "test@mincom.com",
  roles: ["EMPLOYEE"],
  is_mfa_enabled: true,
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

// ---------------------------------------------------------------------------
// ProtectedRoute — must_change_password guard
// ---------------------------------------------------------------------------

describe("ProtectedRoute — must_change_password guard", () => {
  it("redirects to /change-password when must_change_password is true", () => {
    const forceUser: User = { ...baseUser, must_change_password: true };
    const auth = buildAuth({ user: forceUser });

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/appraisals"]}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route
                path="/change-password"
                element={<div data-testid="change-password-page">Change Password</div>}
              />
              <Route
                path="/appraisals"
                element={<div data-testid="appraisals-page">Appraisals</div>}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByTestId("change-password-page")).toBeInTheDocument();
    expect(screen.queryByTestId("appraisals-page")).not.toBeInTheDocument();
  });

  it("does NOT redirect when must_change_password is false", () => {
    const auth = buildAuth();

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/appraisals"]}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route
                path="/change-password"
                element={<div data-testid="change-password-page">Change Password</div>}
              />
              <Route
                path="/appraisals"
                element={<div data-testid="appraisals-page">Appraisals</div>}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByTestId("appraisals-page")).toBeInTheDocument();
    expect(screen.queryByTestId("change-password-page")).not.toBeInTheDocument();
  });

  it("does NOT redirect when already on /change-password (prevents loop)", () => {
    const forceUser: User = { ...baseUser, must_change_password: true };
    const auth = buildAuth({ user: forceUser });

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/change-password"]}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route
                path="/change-password"
                element={<div data-testid="change-password-page">Change Password</div>}
              />
              <Route
                path="/appraisals"
                element={<div data-testid="appraisals-page">Appraisals</div>}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByTestId("change-password-page")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ForceChangePasswordPage — unit tests
// ---------------------------------------------------------------------------

describe("ForceChangePasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the mandatory banner with role='alert'", () => {
    const auth = buildAuth();

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/change-password"]}>
          <Routes>
            <Route path="/change-password" element={<ForceChangePasswordPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(
      "You must set a new password before continuing.",
    );
  });

  it("calls updateUser and navigates to /appraisals on successful password change", async () => {
    mockChangePasswordApi.mockResolvedValueOnce({});

    const updateUser = vi.fn();
    const auth = buildAuth({ updateUser });

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/change-password"]}>
          <Routes>
            <Route path="/change-password" element={<ForceChangePasswordPage />} />
            <Route
              path="/appraisals"
              element={<div data-testid="appraisals-page">Appraisals</div>}
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    // Fill in the change password form
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/current password/i), "OldPassword123!");
    await user.type(screen.getByLabelText(/^new password/i), "NewSecurePass12");
    await user.type(screen.getByLabelText(/confirm new password/i), "NewSecurePass12");

    await user.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith({ must_change_password: false });
    });

    await waitFor(() => {
      expect(screen.getByTestId("appraisals-page")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// ForceChangePasswordPage — PasswordStrengthIndicator tests (TASK-243)
// ---------------------------------------------------------------------------

describe("ForceChangePasswordPage — PasswordStrengthIndicator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows unmet requirement when a non-compliant password is typed", async () => {
    const auth = buildAuth({
      user: { ...baseUser, must_change_password: true },
    });

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/change-password"]}>
          <Routes>
            <Route
              path="/change-password"
              element={<ForceChangePasswordPage />}
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^new password/i), "bad");

    const minLengthItem = screen.getByText("At least 8 characters");
    expect(minLengthItem).toBeInTheDocument();
    // The <li> parent carries the colour class, not the inner <span>
    expect(minLengthItem.closest("li")).not.toHaveClass("text-green-700");
    expect(minLengthItem.closest("li")).toHaveClass("text-gray-500");
  });

  it("does not render indicator before any character is typed", () => {
    const auth = buildAuth({
      user: { ...baseUser, must_change_password: true },
    });

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/change-password"]}>
          <Routes>
            <Route
              path="/change-password"
              element={<ForceChangePasswordPage />}
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(
      screen.queryByText("At least 8 characters"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Not entirely numeric"),
    ).not.toBeInTheDocument();
  });

  it("flips length requirement to met at exactly 8 characters", async () => {
    const auth = buildAuth({
      user: { ...baseUser, must_change_password: true },
    });

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/change-password"]}>
          <Routes>
            <Route
              path="/change-password"
              element={<ForceChangePasswordPage />}
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^new password/i), "Abcde1!x");

    const minLengthItem = screen.getByText("At least 8 characters");
    expect(minLengthItem.closest("li")).toHaveClass("text-green-700");
    expect(minLengthItem.closest("li")).not.toHaveClass("text-gray-500");
  });

  it("marks 'Not entirely numeric' unmet for purely numeric password", async () => {
    const auth = buildAuth({
      user: { ...baseUser, must_change_password: true },
    });

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/change-password"]}>
          <Routes>
            <Route
              path="/change-password"
              element={<ForceChangePasswordPage />}
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^new password/i), "123456789012");

    const minLengthItem = screen.getByText("At least 8 characters");
    const notNumericItem = screen.getByText("Not entirely numeric");
    const specialCharItem = screen.getByText("At least one special character (e.g., ! @ # $ %)");

    // 12 digits meets length requirement
    expect(minLengthItem.closest("li")).toHaveClass("text-green-700");
    // But purely numeric fails the not-numeric requirement
    expect(notNumericItem.closest("li")).not.toHaveClass("text-green-700");
    expect(notNumericItem.closest("li")).toHaveClass("text-gray-500");
    // And no special characters
    expect(specialCharItem.closest("li")).not.toHaveClass("text-green-700");
    expect(specialCharItem.closest("li")).toHaveClass("text-gray-500");
  });

  it("shows all requirements as met when a compliant password is typed", async () => {
    const auth = buildAuth({
      user: { ...baseUser, must_change_password: true },
    });

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/change-password"]}>
          <Routes>
            <Route
              path="/change-password"
              element={<ForceChangePasswordPage />}
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^new password/i), "GoodPass99!xyz");

    const minLengthItem = screen.getByText("At least 8 characters");
    const notNumericItem = screen.getByText("Not entirely numeric");
    const specialCharItem = screen.getByText("At least one special character (e.g., ! @ # $ %)");

    expect(minLengthItem).toBeInTheDocument();
    expect(notNumericItem).toBeInTheDocument();
    expect(specialCharItem).toBeInTheDocument();
    expect(minLengthItem.closest("li")).toHaveClass("text-green-700");
    expect(notNumericItem.closest("li")).toHaveClass("text-green-700");
    expect(specialCharItem.closest("li")).toHaveClass("text-green-700");
  });
});

// ---------------------------------------------------------------------------
// Integration: login flow with must_change_password
// ---------------------------------------------------------------------------

describe("Integration: login with must_change_password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lands on /change-password after login when must_change_password is true", () => {
    const forceUser: User = { ...baseUser, must_change_password: true };
    const auth = buildAuth({ user: forceUser });

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/appraisals"]}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route
                path="/change-password"
                element={<div data-testid="change-password-page">Change Password</div>}
              />
              <Route
                path="/appraisals"
                element={<div data-testid="appraisals-page">Appraisals</div>}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByTestId("change-password-page")).toBeInTheDocument();
    expect(screen.queryByTestId("appraisals-page")).not.toBeInTheDocument();
  });

  it("lands on /change-password after MFA verify when must_change_password is true", () => {
    const forceUser: User = { ...baseUser, must_change_password: true };
    const auth = buildAuth({ user: forceUser });

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/appraisals"]}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route
                path="/change-password"
                element={<div data-testid="change-password-page">Change Password</div>}
              />
              <Route
                path="/appraisals"
                element={<div data-testid="appraisals-page">Appraisals</div>}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByTestId("change-password-page")).toBeInTheDocument();
  });
});
