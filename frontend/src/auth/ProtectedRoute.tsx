/**
 * ProtectedRoute — Route wrapper that enforces authentication and
 * optional role-based access.
 *
 * Behaviour:
 * 1. While auth state is initialising (isLoading), renders a spinner.
 * 2. If not authenticated, redirects to /login preserving the intended
 *    destination in location state for post-login redirect.
 * 3. If authenticated but user lacks a required role (when allowedRoles
 *    is specified), redirects to /unauthorized.
 * 4. Otherwise, renders the <Outlet /> for nested routes.
 *
 * Usage with React Router:
 * ```tsx
 * <Route element={<ProtectedRoute />}>
 *   <Route path="/dashboard" element={<Dashboard />} />
 * </Route>
 * ```
 */

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import type { UserRole } from "@/auth/types";

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user, mfaSetupRequired } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-gray-50"
        role="status"
        aria-label="Verifying authentication"
      >
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-secondary" />
        <span className="sr-only">Verifying authentication...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (
    user?.must_change_password === true &&
    location.pathname !== "/change-password"
  ) {
    return <Navigate to="/change-password" replace />;
  }

  if (
    mfaSetupRequired &&
    user &&
    !user.is_mfa_enabled &&
    location.pathname !== "/mfa-setup" &&
    location.pathname !== "/change-password"
  ) {
    return <Navigate to="/mfa-setup" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && user) {
    const hasRequiredRole = user.roles.some((role) =>
      allowedRoles.includes(role),
    );
    if (!hasRequiredRole) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return <Outlet />;
}
