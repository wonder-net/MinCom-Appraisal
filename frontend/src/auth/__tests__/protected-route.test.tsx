/**
 * Tests for ProtectedRoute, RoleGuard, useRequireRole, and Layout.
 *
 * Covers: authentication redirect, role-based access, loading state,
 * layout rendering, and catch-all routing.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthContext } from "../AuthContext";
import { ProtectedRoute } from "../ProtectedRoute";
import { RoleGuard } from "../RoleGuard";
import { Layout } from "@/components/Layout";
import { useRequireRole } from "@/hooks/useRequireRole";
import { useAuth } from "../useAuth";
import type { AuthContextType, User, UserRole } from "../types";

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

function buildAuthContext(
  overrides: Partial<AuthContextType> = {},
): AuthContextType {
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

function renderWithRouter(
  authValue: AuthContextType,
  initialEntry: string,
  routeChildren?: ReactNode,
) {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
          <Route path="/unauthorized" element={<div data-testid="unauthorized-page">Unauthorized</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div data-testid="dashboard-page">Dashboard</div>} />
          </Route>
          {routeChildren}
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

// ---------------------------------------------------------------------------
// ProtectedRoute Tests
// ---------------------------------------------------------------------------

describe("ProtectedRoute", () => {
  it("redirects to /login when user is not authenticated", () => {
    const auth = buildAuthContext({
      user: null,
      isAuthenticated: false,
      accessToken: null,
    });

    renderWithRouter(auth, "/dashboard");

    expect(screen.getByTestId("login-page")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-page")).not.toBeInTheDocument();
  });

  it("renders child route when user is authenticated", () => {
    const auth = buildAuthContext();

    renderWithRouter(auth, "/dashboard");

    expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
    expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
  });

  it("shows loading spinner while auth state is initialising", () => {
    const auth = buildAuthContext({ isLoading: true });

    renderWithRouter(auth, "/dashboard");

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Verifying authentication...")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-page")).not.toBeInTheDocument();
    expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
  });

  it("preserves intended destination in location state on redirect", () => {
    function LoginWithStateReader() {
      const location = useLocation();
      const state = location.state as { from?: string } | null;
      return (
        <div>
          <span data-testid="login-page">Login Page</span>
          <span data-testid="state-from">{state?.from ?? "none"}</span>
        </div>
      );
    }

    const auth = buildAuthContext({
      user: null,
      isAuthenticated: false,
      accessToken: null,
    });

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route path="/login" element={<LoginWithStateReader />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<div>Dashboard</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByTestId("login-page")).toBeInTheDocument();
    expect(screen.getByTestId("state-from")).toHaveTextContent("/dashboard");
  });

  it("redirects to /mfa-setup when authenticated but MFA not enabled", () => {
    const noMfaUser: User = { ...baseUser, is_mfa_enabled: false };
    const auth = buildAuthContext({ user: noMfaUser });

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route path="/login" element={<div data-testid="login-page">Login</div>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/mfa-setup" element={<div data-testid="mfa-setup-page">MFA Setup</div>} />
              <Route path="/dashboard" element={<div data-testid="dashboard-page">Dashboard</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByTestId("mfa-setup-page")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-page")).not.toBeInTheDocument();
  });

  it("does not redirect /mfa-setup to itself when MFA not enabled", () => {
    const noMfaUser: User = { ...baseUser, is_mfa_enabled: false };
    const auth = buildAuthContext({ user: noMfaUser });

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/mfa-setup"]}>
          <Routes>
            <Route path="/login" element={<div data-testid="login-page">Login</div>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/mfa-setup" element={<div data-testid="mfa-setup-page">MFA Setup</div>} />
              <Route path="/dashboard" element={<div data-testid="dashboard-page">Dashboard</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByTestId("mfa-setup-page")).toBeInTheDocument();
  });

  it("does not redirect to /mfa-setup when mfaSetupRequired is false even if MFA not enabled", () => {
    const noMfaUser: User = { ...baseUser, is_mfa_enabled: false };
    const auth = buildAuthContext({ user: noMfaUser, mfaSetupRequired: false });

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route path="/login" element={<div data-testid="login-page">Login</div>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/mfa-setup" element={<div data-testid="mfa-setup-page">MFA Setup</div>} />
              <Route path="/dashboard" element={<div data-testid="dashboard-page">Dashboard</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
    expect(screen.queryByTestId("mfa-setup-page")).not.toBeInTheDocument();
  });

  it("redirects to /mfa-setup when mfaSetupRequired is true and MFA not enabled", () => {
    const noMfaUser: User = { ...baseUser, is_mfa_enabled: false };
    const auth = buildAuthContext({ user: noMfaUser, mfaSetupRequired: true });

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route path="/login" element={<div data-testid="login-page">Login</div>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/mfa-setup" element={<div data-testid="mfa-setup-page">MFA Setup</div>} />
              <Route path="/dashboard" element={<div data-testid="dashboard-page">Dashboard</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByTestId("mfa-setup-page")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-page")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ProtectedRoute with allowedRoles
// ---------------------------------------------------------------------------

describe("ProtectedRoute with allowedRoles", () => {
  function renderWithRoles(
    userRoles: UserRole[],
    allowedRoles: UserRole[],
    initialEntry: string,
  ) {
    const user: User = { ...baseUser, roles: userRoles };
    const auth = buildAuthContext({ user });

    return render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/login" element={<div data-testid="login-page">Login</div>} />
            <Route path="/unauthorized" element={<div data-testid="unauthorized-page">Unauthorized</div>} />
            <Route element={<ProtectedRoute allowedRoles={allowedRoles} />}>
              <Route path="/admin" element={<div data-testid="admin-page">Admin</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
  }

  it("renders child when user has one of the allowed roles", () => {
    renderWithRoles(["HR_ADMIN", "EMPLOYEE"], ["HR_ADMIN", "HR_OFFICER"], "/admin");

    expect(screen.getByTestId("admin-page")).toBeInTheDocument();
  });

  it("redirects to /unauthorized when user lacks the required role", () => {
    renderWithRoles(["EMPLOYEE"], ["HR_ADMIN", "HR_OFFICER"], "/admin");

    expect(screen.getByTestId("unauthorized-page")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-page")).not.toBeInTheDocument();
  });

  it("allows multi-role user with any matching role", () => {
    renderWithRoles(
      ["EMPLOYEE", "MANAGER"],
      ["MANAGER", "EXECUTIVE"],
      "/admin",
    );

    expect(screen.getByTestId("admin-page")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// RoleGuard Tests
// ---------------------------------------------------------------------------

describe("RoleGuard", () => {
  function renderRoleGuard(
    userRoles: UserRole[],
    guardRoles: UserRole[],
    fallback?: ReactNode,
  ) {
    const user: User = { ...baseUser, roles: userRoles };
    const auth = buildAuthContext({ user });

    return render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <RoleGuard roles={guardRoles} fallback={fallback}>
            <div data-testid="protected-content">Secret Content</div>
          </RoleGuard>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
  }

  it("renders children when user has the required role", () => {
    renderRoleGuard(["HR_ADMIN"], ["HR_ADMIN"]);

    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
  });

  it("renders default fallback when user lacks the required role", () => {
    renderRoleGuard(["EMPLOYEE"], ["HR_ADMIN"]);

    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(
      screen.getByText("You do not have permission to view this content."),
    ).toBeInTheDocument();
  });

  it("renders custom fallback when user lacks the required role", () => {
    renderRoleGuard(
      ["EMPLOYEE"],
      ["HR_ADMIN"],
      <div data-testid="custom-fallback">Custom Denied</div>,
    );

    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("custom-fallback")).toBeInTheDocument();
  });

  it("allows access when user has any one of multiple roles", () => {
    renderRoleGuard(["MANAGER"], ["HR_ADMIN", "MANAGER", "EXECUTIVE"]);

    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
  });

  it("renders fallback when user is null", () => {
    const auth = buildAuthContext({ user: null });

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <RoleGuard roles={["HR_ADMIN"]}>
            <div data-testid="protected-content">Secret</div>
          </RoleGuard>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });

  it("renders nothing while auth is loading instead of showing fallback", () => {
    const auth = buildAuthContext({ isLoading: true, user: null });

    const { container } = render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <RoleGuard roles={["HR_ADMIN"]}>
            <div data-testid="protected-content">Secret</div>
          </RoleGuard>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(
      screen.queryByText("You do not have permission to view this content."),
    ).not.toBeInTheDocument();
    expect(container.querySelector("[role='alert']")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// useRequireRole Tests
// ---------------------------------------------------------------------------

describe("useRequireRole", () => {
  function UseRequireRoleConsumer({ roles }: { roles: UserRole[] }) {
    const { hasAccess, user } = useRequireRole(roles);
    return (
      <div>
        <span data-testid="has-access">{String(hasAccess)}</span>
        <span data-testid="user-email">{user?.email ?? "none"}</span>
      </div>
    );
  }

  it("returns hasAccess=true when user has a matching role", () => {
    const user: User = { ...baseUser, roles: ["MANAGER", "EMPLOYEE"] };
    const auth = buildAuthContext({ user });

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <UseRequireRoleConsumer roles={["MANAGER"]} />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByTestId("has-access").textContent).toBe("true");
    expect(screen.getByTestId("user-email").textContent).toBe("test@mincom.com");
  });

  it("returns hasAccess=false when user has no matching role", () => {
    const user: User = { ...baseUser, roles: ["EMPLOYEE"] };
    const auth = buildAuthContext({ user });

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <UseRequireRoleConsumer roles={["HR_ADMIN", "EXECUTIVE"]} />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByTestId("has-access").textContent).toBe("false");
  });

  it("returns hasAccess=false when user is null", () => {
    const auth = buildAuthContext({ user: null });

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <UseRequireRoleConsumer roles={["EMPLOYEE"]} />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByTestId("has-access").textContent).toBe("false");
    expect(screen.getByTestId("user-email").textContent).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// Layout Tests
// ---------------------------------------------------------------------------

describe("Layout", () => {
  it("shows sign-out button and renders child route", () => {
    const auth = buildAuthContext();

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route element={<Layout />}>
              <Route
                path="/dashboard"
                element={<div data-testid="dashboard">Dashboard</div>}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    // User email is shown in the sidebar footer, not as a separate data-testid
    expect(screen.getByText("test@mincom.com")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("dashboard")).toBeInTheDocument();
  });

  it("calls logout when sign-out button is clicked", async () => {
    const mockLogout = vi.fn().mockResolvedValue(undefined);
    const auth = buildAuthContext({ logout: mockLogout });

    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route path="/login" element={<div data-testid="login-page">Login</div>} />
            <Route element={<Layout />}>
              <Route
                path="/dashboard"
                element={<div data-testid="dashboard">Dashboard</div>}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledOnce();
    });
  });
});

// ---------------------------------------------------------------------------
// Integration: navigation redirects
// ---------------------------------------------------------------------------

describe("Integration: route navigation", () => {
  /**
   * Helper that mirrors App.tsx route structure including
   * a catch-all and a /login redirect for authenticated users.
   */
  function renderFullRouter(authValue: AuthContextType, initialEntry: string) {
    function CatchAllRedirect() {
      const { isAuthenticated: authed, isLoading: loading } = useAuth();
      if (loading) return null;
      if (authed) return <Navigate to="/dashboard" replace />;
      return <Navigate to="/login" replace />;
    }

    function LoginPageWithRedirect() {
      const { isAuthenticated: authed } = useAuth();
      if (authed) return <Navigate to="/dashboard" replace />;
      return <div data-testid="login-page">Login Page</div>;
    }

    return render(
      <AuthContext.Provider value={authValue}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/login" element={<LoginPageWithRedirect />} />
            <Route path="/unauthorized" element={<div data-testid="unauthorized-page">Unauthorized</div>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/mfa-setup" element={<div data-testid="mfa-setup-page">MFA Setup</div>} />
              <Route path="/dashboard" element={<div data-testid="dashboard-page">Dashboard</div>} />
            </Route>
            <Route path="*" element={<CatchAllRedirect />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
  }

  it("redirects /dashboard to /login when not authenticated", () => {
    const auth = buildAuthContext({
      user: null,
      isAuthenticated: false,
      accessToken: null,
    });

    renderFullRouter(auth, "/dashboard");

    expect(screen.getByTestId("login-page")).toBeInTheDocument();
  });

  it("renders /dashboard when authenticated", () => {
    const auth = buildAuthContext();

    renderFullRouter(auth, "/dashboard");

    expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
  });

  it("redirects authenticated user visiting /login to /dashboard", () => {
    const auth = buildAuthContext();

    renderFullRouter(auth, "/login");

    expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
    expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
  });

  it("catch-all redirects authenticated user to /dashboard", () => {
    const auth = buildAuthContext();

    renderFullRouter(auth, "/some-unknown-route");

    expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
  });

  it("catch-all redirects unauthenticated user to /login", () => {
    const auth = buildAuthContext({
      user: null,
      isAuthenticated: false,
      accessToken: null,
    });

    renderFullRouter(auth, "/some-unknown-route");

    expect(screen.getByTestId("login-page")).toBeInTheDocument();
  });
});
