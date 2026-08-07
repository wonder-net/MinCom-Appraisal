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

import type { User } from "./types";

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
