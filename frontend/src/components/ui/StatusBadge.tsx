/**
 * StatusBadge — Canonical badge component for all status types.
 *
 * Maps workflow statuses, cycle statuses, audit actions, and MFA states
 * to the colour scheme defined in the design consistency guide.
 * Unknown statuses render a neutral grey badge.
 */

interface StatusBadgeProps {
  status: string;
  className?: string;
}

interface BadgeConfig {
  label: string;
  classes: string;
}

const STATUS_MAP: Record<string, BadgeConfig> = {
  // Appraisal workflow statuses
  SELF_ASSESSMENT: {
    label: "Self Assessment",
    classes: "bg-blue-50 text-blue-700 border-blue-200",
  },
  MANAGER_REVIEW: {
    label: "Manager Review",
    classes: "bg-amber-50 text-amber-700 border-amber-300",
  },
  DISCUSSION: {
    label: "Discussion",
    classes: "bg-purple-50 text-purple-700 border-purple-200",
  },
  GROWTH_PLAN: {
    label: "Growth Plan",
    classes: "bg-teal-50 text-teal-700 border-teal-300",
  },
  GROWTH_PLANNING: {
    label: "Growth Planning",
    classes: "bg-teal-50 text-teal-700 border-teal-300",
  },
  PENDING_SIGNOFF: {
    label: "Pending Signoff",
    classes: "bg-orange-50 text-orange-700 border-orange-300",
  },
  SIGNED_OFF: {
    label: "Signed Off",
    classes: "bg-green-50 text-green-700 border-green-200",
  },
  FINALISED: {
    label: "Finalised",
    classes: "bg-emerald-50 text-emerald-800 border-emerald-300",
  },
  DISPUTED: {
    label: "Disputed",
    classes: "bg-red-50 text-red-700 border-red-200",
  },
  EXCLUDED: {
    label: "Excluded",
    classes: "bg-slate-100 text-slate-500 border-slate-300",
  },
  INCOMPLETE: {
    label: "Incomplete",
    classes: "bg-yellow-50 text-yellow-700 border-yellow-300",
  },
  // Cycle statuses
  ACTIVE: {
    label: "Active",
    classes: "bg-green-50 text-green-700 border-green-300",
  },
  CLOSED: {
    label: "Closed",
    classes: "bg-primary-light text-primary border-secondary",
  },
  ARCHIVED: {
    label: "Archived",
    classes: "bg-slate-100 text-slate-600 border-slate-300",
  },
  // Generic statuses
  Active: {
    label: "Active",
    classes: "bg-green-50 text-green-700 border-green-300",
  },
  Inactive: {
    label: "Inactive",
    classes: "bg-gray-100 text-gray-500 border-gray-300",
  },
  Draft: {
    label: "Draft",
    classes: "bg-gray-100 text-gray-600 border-gray-300",
  },
  // Audit action types
  UPDATE: {
    label: "UPDATE",
    classes: "bg-primary-light text-primary border-secondary",
  },
  CREATE: {
    label: "CREATE",
    classes: "bg-green-50 text-green-700 border-green-300",
  },
  DELETE: {
    label: "DELETE",
    classes: "bg-red-50 text-red-700 border-red-200",
  },
  LOGIN: {
    label: "LOGIN",
    classes: "bg-gray-100 text-gray-600 border-gray-300",
  },
  LOGOUT: {
    label: "LOGOUT",
    classes: "bg-gray-100 text-gray-600 border-gray-300",
  },
  // MFA statuses
  Enabled: {
    label: "Enabled",
    classes: "bg-green-50 text-green-700 border-green-300",
  },
  Disabled: {
    label: "Disabled",
    classes: "bg-gray-100 text-gray-600 border-gray-300",
  },
};

const NEUTRAL_CLASSES = "bg-gray-100 text-gray-600 border-gray-300";

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const config = STATUS_MAP[status];
  const classes = config?.classes ?? NEUTRAL_CLASSES;
  const label = config?.label ?? status;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${classes} ${className}`.trim()}
    >
      {label}
    </span>
  );
}
