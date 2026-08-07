/**
 * resolveUserRelation — Determines the user's relationship to an appraisal.
 *
 * Resolution order:
 * 1. If user/appraisal is null → "NONE"
 * 2. If user is the appraisee → "APPRAISEE"
 * 3. If the appraisal is escalated (escalated_executive set):
 *    - User is the escalated executive AND has EXECUTIVE/MANAGER/admin-tier role
 *      → "APPRAISER" (the executive has replaced the original manager for
 *      write rights — see TASK-268 backend; the original manager's writes are
 *      403'd server-side, so the UI must NOT resolve them to APPRAISER).
 *    - User has admin-tier role (HR_ADMIN / SYSTEM_ADMIN — TASK-303) → "HR_ADMIN"
 *    - Otherwise → "NONE" (the original manager lands here; the escalation
 *      banner in AppraisalDetailPage already informs them, and the backend
 *      gates the writes).
 * 4. Otherwise (no escalation, baseline):
 *    - User is the FK appraiser AND has MANAGER or admin-tier role → "APPRAISER"
 *      (EXECUTIVE-only users who are the FK manager can view but not appraise)
 *    - User has admin-tier role (HR_ADMIN / SYSTEM_ADMIN — TASK-303) → "HR_ADMIN"
 *    - Otherwise → "NONE"
 *
 * Note: `UserRelation = "APPRAISER"` is an internal type identifier; the
 * user-visible label uses the stakeholder's preferred "Appraisor" spelling
 * but renaming the type would balloon the diff across many components.
 *
 * Note: The `"HR_ADMIN"` relation tag is a back-compat string — it represents
 * the admin-tier persona (HR_ADMIN OR SYSTEM_ADMIN). Downstream gating logic
 * already treats it as a single privilege set, so keeping the legacy tag
 * avoids a cross-cutting rename.
 */

export type UserRelation = "APPRAISEE" | "APPRAISER" | "HR_ADMIN" | "NONE";

interface UserInfo {
  id: string;
  employee_id: string | null;
  roles: string[];
}

interface AppraisalInfo {
  employee_id: string;
  appraiser_id: string | null;
  escalated_executive: string | null;
}

/** True when the user holds any admin-tier role (HR_ADMIN or SYSTEM_ADMIN). */
function hasAdminRole(roles: readonly string[]): boolean {
  return roles.includes("HR_ADMIN") || roles.includes("SYSTEM_ADMIN");
}

export function resolveUserRelation(
  user: UserInfo | null,
  appraisal: AppraisalInfo | null,
): UserRelation {
  if (!user || !appraisal) return "NONE";
  if (user.employee_id === appraisal.employee_id) return "APPRAISEE";

  // TASK-268: When an appraisal is escalated, the escalated executive takes
  // over write rights from the original manager. The backend rewrites the
  // permission check, so the UI must mirror that — otherwise the original
  // manager sees editable controls that 403, and the executive sees nothing.
  if (appraisal.escalated_executive !== null) {
    if (
      user.id === appraisal.escalated_executive &&
      (user.roles.includes("EXECUTIVE") ||
        user.roles.includes("MANAGER") ||
        hasAdminRole(user.roles))
    ) {
      return "APPRAISER";
    }
    if (hasAdminRole(user.roles)) return "HR_ADMIN";
    return "NONE";
  }

  if (
    user.employee_id === appraisal.appraiser_id &&
    (user.roles.includes("MANAGER") || hasAdminRole(user.roles))
  ) {
    return "APPRAISER";
  }
  if (hasAdminRole(user.roles)) return "HR_ADMIN";
  return "NONE";
}
