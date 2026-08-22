/**
 * Role-based access helpers.
 *
 * Centralised predicates for role checks that recur across the UI. Use these
 * in place of inline `user.roles.includes("HR_ADMIN")` checks so that when a
 * new admin-tier role is added (e.g. SYSTEM_ADMIN — TASK-303), only this
 * file needs updating.
 *
 * Pure functions only — no React imports, no side effects.
 */

import type { User, UserRole } from "./types";

/**
 * Roles that can browse the (RBAC-scoped) Employee Directory —
 * mirrors the "Employees" sidebar nav entry's allowedRoles
 * (sidebar-nav.tsx). Plain EMPLOYEE accounts are deliberately
 * excluded: EmployeeRepository::scopedList() scopes their view of
 * /api/v1/employees/ down to just their own record, so a "Directory"
 * with a search box and nothing meaningful to search is a confusing
 * dead end for them, not a useful feature — not a data-leak concern
 * (the backend already enforces the same scoping either way), but a
 * page that shouldn't be reachable at all for that role.
 */
export const EMPLOYEE_DIRECTORY_ROLES: readonly UserRole[] = [
  "HR_ADMIN",
  "SYSTEM_ADMIN",
  "HR_OFFICER",
  "EXECUTIVE",
  "MANAGER",
];

/**
 * Returns true when the user holds an admin-tier role.
 *
 * Admin-tier roles share platform-administration privileges: HR_ADMIN is
 * the primary admin persona, and SYSTEM_ADMIN is a delegated role for IT
 * operators with identical access (TASK-303).
 *
 * Use this hook-free helper to gate admin-only UI such as escalation
 * actions, the user-management page, and admin navigation entries.
 */
export function isAdminUser(user: User | null): boolean {
  if (!user) return false;
  return user.roles.some(
    (role) => role === "HR_ADMIN" || role === "SYSTEM_ADMIN",
  );
}

/**
 * Returns true when the user can browse the Employee Directory
 * (/employees). See EMPLOYEE_DIRECTORY_ROLES for why plain EMPLOYEE
 * accounts don't get this.
 */
export function canViewEmployeeDirectory(user: User | null): boolean {
  if (!user) return false;
  return user.roles.some((role) => EMPLOYEE_DIRECTORY_ROLES.includes(role));
}
