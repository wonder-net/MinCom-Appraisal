/**
 * RoleBadge — Colour-coded role label for the user table.
 *
 * Each role has a distinct colour combination for quick identification.
 */

import { Badge } from "@/components/ui/badge";
import { ROLE_DISPLAY_LABELS } from "@/types";
import type { AdminRole } from "@/types";

interface RoleBadgeProps {
  role: string;
}

const ROLE_CLASSES: Record<string, string> = {
  HR_ADMIN: "bg-primary-light text-primary border-secondary",
  // SYSTEM_ADMIN mirrors HR_ADMIN's access level but gets a distinct
  // colour so admin users can still tell them apart at a glance.
  SYSTEM_ADMIN: "bg-teal-50 text-teal-700 border-teal-200",
  HR_OFFICER: "bg-blue-50 text-blue-700 border-blue-200",
  MANAGER: "bg-amber-50 text-amber-700 border-amber-200",
  EMPLOYEE: "bg-gray-100 text-gray-600 border-gray-300",
  EXECUTIVE: "bg-purple-50 text-purple-700 border-purple-200",
};

export function RoleBadge({ role }: RoleBadgeProps) {
  const label = ROLE_DISPLAY_LABELS[role as AdminRole] ?? role.replace(/_/g, " ");
  return (
    <Badge
      variant="outline"
      className={`text-xs mr-1 ${ROLE_CLASSES[role] ?? ""}`}
    >
      {label}
    </Badge>
  );
}
