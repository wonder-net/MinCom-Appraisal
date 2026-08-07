/**
 * AppraisalStatusBadge — Coloured pill badge for all 10 appraisal statuses.
 *
 * Renders a human-readable label with the colour scheme defined in
 * the design system (appraisal-screens.md Status Badge Colour Mapping).
 */

import type { AppraisalStatus } from "@/types";

interface AppraisalStatusBadgeProps {
  status: AppraisalStatus;
}

const STATUS_STYLES: Record<AppraisalStatus, string> = {
  SELF_ASSESSMENT: "bg-blue-50 text-blue-700 border-blue-200",
  MANAGER_REVIEW: "bg-amber-50 text-amber-700 border-amber-300",
  DISCUSSION: "bg-purple-50 text-purple-700 border-purple-200",
  GROWTH_PLANNING: "bg-teal-50 text-teal-700 border-teal-200",
  PENDING_SIGNOFF: "bg-orange-50 text-orange-700 border-orange-300",
  SIGNED_OFF: "bg-green-50 text-green-700 border-green-200",
  FINALISED: "bg-emerald-50 text-emerald-800 border-emerald-300",
  DISPUTED: "bg-red-50 text-red-700 border-red-200",
  EXCLUDED: "bg-slate-100 text-slate-500 border-slate-300",
  INCOMPLETE: "bg-yellow-50 text-yellow-700 border-yellow-300",
};

const STATUS_LABELS: Record<AppraisalStatus, string> = {
  SELF_ASSESSMENT: "Self Assessment",
  MANAGER_REVIEW: "Manager Review",
  DISCUSSION: "Discussion",
  GROWTH_PLANNING: "Growth Planning",
  PENDING_SIGNOFF: "Pending Signoff",
  SIGNED_OFF: "Signed Off",
  FINALISED: "Finalised",
  DISPUTED: "Disputed",
  EXCLUDED: "Excluded",
  INCOMPLETE: "Incomplete",
};

export function AppraisalStatusBadge({ status }: AppraisalStatusBadgeProps) {
  const styles = STATUS_STYLES[status];
  const label = STATUS_LABELS[status];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles}`}
    >
      {label}
    </span>
  );
}
