/**
 * RoleGuard — Conditionally renders children based on the current
 * user's roles.
 *
 * Use this for inline role checks within pages — e.g. hiding an
 * "Admin Settings" section from non-admin users.
 *
 * @example
 * ```tsx
 * <RoleGuard roles={["HR_ADMIN", "HR_OFFICER"]}>
 *   <AdminPanel />
 * </RoleGuard>
 * ```
 */

import type { ReactNode } from "react";
import { useAuth } from "@/auth/useAuth";
import type { UserRole } from "@/auth/types";

interface RoleGuardProps {
  roles: UserRole[];
  children: ReactNode;
  fallback?: ReactNode;
}

const defaultFallback = (
  <div
    className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    role="alert"
    aria-label="Access denied"
  >
    You do not have permission to view this content.
  </div>
);

export function RoleGuard({
  roles,
  children,
  fallback = defaultFallback,
}: RoleGuardProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!user) {
    return <>{fallback}</>;
  }

  const hasAccess = user.roles.some((userRole) => roles.includes(userRole));

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
