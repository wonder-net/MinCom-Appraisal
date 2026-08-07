/**
 * Custom hook to check if the current user has at least one of the
 * specified roles.
 *
 * Returns the current user and a boolean indicating whether they have
 * access. Does not redirect or throw — that is the caller's responsibility.
 *
 * @example
 * ```tsx
 * const { hasAccess, user } = useRequireRole(["HR_ADMIN", "HR_OFFICER"]);
 * if (!hasAccess) return <AccessDenied />;
 * ```
 */

import { useMemo } from "react";
import { useAuth } from "@/auth/useAuth";
import type { User, UserRole } from "@/auth/types";

interface UseRequireRoleResult {
  hasAccess: boolean;
  user: User | null;
}

export function useRequireRole(roles: UserRole[]): UseRequireRoleResult {
  const { user } = useAuth();

  const hasAccess = useMemo(() => {
    if (!user) return false;
    return user.roles.some((userRole) => roles.includes(userRole));
  }, [user, roles]);

  return { hasAccess, user };
}
