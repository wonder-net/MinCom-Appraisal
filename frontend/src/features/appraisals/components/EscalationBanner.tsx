/**
 * EscalationBanner — Non-dismissable amber banner shown to the original
 * manager of an escalated appraisal. Signals read-only access and names
 * the Executive who is now the appraisor. AC-13 of TASK-268.
 *
 * Visual contract: implements .claude/design/wireframes/EscalationBanner.wireframe.tsx.
 *
 * Conditional rendering belongs to the parent (AppraisalDetailPage) —
 * this component renders the banner unconditionally when mounted.
 */

import { Alert, AlertDescription } from "@/components/ui/alert";

export interface EscalationBannerProps {
  executiveName: string;
}

export function EscalationBanner({ executiveName }: EscalationBannerProps) {
  return (
    <Alert
      variant="warning"
      role="alert"
      aria-label="Read-only access notice"
      className="mb-6 flex items-start gap-3"
    >
      <svg
        aria-hidden="true"
        className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
        />
      </svg>
      <AlertDescription className="text-sm leading-relaxed">
        <span className="font-semibold">This appraisal has been escalated.</span>{" "}
        You have read-only access.{" "}
        <span className="font-medium">{executiveName}</span> is now the appraisor.
      </AlertDescription>
    </Alert>
  );
}
