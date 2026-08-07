/**
 * ExecutiveEscalatedBadge — Inline indigo "Escalated" pill shown next to
 * the status badge on Executive queue rows for appraisals where the
 * current user is the escalated executive. AC-14 of TASK-268.
 *
 * Visual contract: implements .claude/design/wireframes/ExecutiveEscalatedBadge.wireframe.tsx.
 * Indigo is reserved exclusively for this badge so it remains visually
 * distinct from every existing AppraisalStatusBadge colour.
 */

export interface ExecutiveEscalatedBadgeProps {
  isEscalated: boolean;
}

export function ExecutiveEscalatedBadge({
  isEscalated,
}: ExecutiveEscalatedBadgeProps) {
  if (!isEscalated) return null;
  return (
    <span
      aria-label="Escalated to you"
      className="ml-2 inline-flex items-center rounded-full border border-indigo-300 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700"
    >
      Escalated
    </span>
  );
}
