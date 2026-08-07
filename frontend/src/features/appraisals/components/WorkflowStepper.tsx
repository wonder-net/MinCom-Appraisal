/**
 * WorkflowStepper — horizontal progress indicator for the appraisal
 * workflow. Renders 6 steps when self-rating is enabled, or 5 steps
 * when disabled (no "Self Assess" bubble).
 *
 * Uses grid-cols-6 / grid-cols-5 to prevent label overlap. Completed
 * steps show a checkmark, the active step is highlighted, and
 * future steps are greyed out.
 *
 * DISPUTED maps to the step before it occurred (PENDING_SIGNOFF).
 * EXCLUDED and INCOMPLETE map to step 0 with a warning indicator.
 */

import type { AppraisalStatus } from "@/types";

interface WorkflowStepperProps {
  status: AppraisalStatus;
  selfRatingEnabled: boolean;
}

const STEPS_6 = [
  "Self Assess",
  "Mgr Review",
  "Discussion",
  "Growth Plan",
  "Signoff",
  "Finalised",
] as const;

const STEPS_5 = [
  "Mgr Review",
  "Discussion",
  "Growth Plan",
  "Signoff",
  "Finalised",
] as const;

/**
 * Maps each status to the stepper index for the 6-step variant.
 * For DISPUTED, we show the PENDING_SIGNOFF step since disputes arise
 * from signoff. EXCLUDED and INCOMPLETE fall back to step 0.
 */
const STATUS_TO_STEP_INDEX_6: Record<AppraisalStatus, number> = {
  SELF_ASSESSMENT: 0,
  MANAGER_REVIEW: 1,
  DISCUSSION: 2,
  GROWTH_PLANNING: 3,
  PENDING_SIGNOFF: 4,
  SIGNED_OFF: 4,
  FINALISED: 5,
  DISPUTED: 4,
  EXCLUDED: 0,
  INCOMPLETE: 0,
};

/**
 * Maps each status to the stepper index for the 5-step variant
 * (no Self Assess step). SELF_ASSESSMENT maps to 0 as a guard —
 * it should never occur when self-rating is disabled.
 */
const STATUS_TO_STEP_INDEX_5: Record<AppraisalStatus, number> = {
  SELF_ASSESSMENT: 0,
  MANAGER_REVIEW: 0,
  DISCUSSION: 1,
  GROWTH_PLANNING: 2,
  PENDING_SIGNOFF: 3,
  SIGNED_OFF: 3,
  FINALISED: 4,
  DISPUTED: 3,
  EXCLUDED: 0,
  INCOMPLETE: 0,
};

const WARNING_STATUSES: ReadonlySet<AppraisalStatus> = new Set([
  "DISPUTED",
  "EXCLUDED",
  "INCOMPLETE",
]);

function isWarningStatus(status: AppraisalStatus): boolean {
  return WARNING_STATUSES.has(status);
}

export function WorkflowStepper({ status, selfRatingEnabled }: WorkflowStepperProps) {
  const steps = selfRatingEnabled ? STEPS_6 : STEPS_5;
  const indexMap = selfRatingEnabled ? STATUS_TO_STEP_INDEX_6 : STATUS_TO_STEP_INDEX_5;
  const gridCols = selfRatingEnabled ? "grid-cols-6" : "grid-cols-5";

  const currentIndex = indexMap[status];
  const showWarning = isWarningStatus(status);

  return (
    <nav
      aria-label="Appraisal workflow progress"
      className="w-full"
    >
      {/* Desktop: grid layout with inline flex connectors */}
      <div className="hidden sm:block">
        <div className={`grid ${gridCols} gap-0`}>
          {steps.map((label, i) => {
            const isCompleted = !showWarning && i < currentIndex;
            const isActive = i === currentIndex;
            const isFirst = i === 0;
            const isLast = i === steps.length - 1;

            const leftLineColor =
              isCompleted || isActive ? "bg-primary" : "bg-gray-200";
            const rightLineColor = isCompleted ? "bg-primary" : "bg-gray-200";

            return (
              <div key={label} className="flex items-center">
                <div
                  className={`flex-1 h-0.5 ${isFirst ? "bg-transparent" : leftLineColor}`}
                  aria-hidden="true"
                />
                <div
                  aria-current={isActive ? "step" : undefined}
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold flex-shrink-0 ${
                    showWarning && isActive
                      ? "bg-amber-100 border-2 border-amber-400 text-amber-700"
                      : isCompleted
                        ? "bg-primary text-white"
                        : isActive
                          ? "bg-secondary text-white"
                          : "bg-white border-2 border-gray-300 text-gray-400"
                  }`}
                >
                  {showWarning && isActive
                    ? "\u26A0"
                    : isCompleted
                      ? "\u2713"
                      : i + 1}
                </div>
                <div
                  className={`flex-1 h-0.5 ${isLast ? "bg-transparent" : rightLineColor}`}
                  aria-hidden="true"
                />
              </div>
            );
          })}
        </div>
        {/* Labels row */}
        <div className={`grid ${gridCols} gap-0 mt-1.5`}>
          {steps.map((label, i) => {
            const isCompleted = !showWarning && i < currentIndex;
            const isActive = i === currentIndex;
            return (
              <span
                key={label}
                className={`text-[8px] text-center leading-tight ${
                  showWarning && isActive
                    ? "text-amber-700 font-semibold"
                    : isCompleted
                      ? "text-primary font-medium"
                      : isActive
                        ? "text-secondary font-semibold"
                        : "text-gray-400"
                }`}
              >
                {label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Warning overlay for DISPUTED/EXCLUDED/INCOMPLETE */}
      {showWarning && (
        <div className="hidden sm:flex mt-2 items-center justify-center gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700">
          <span aria-hidden="true">&#9888;</span>
          <span>{status.replace(/_/g, " ")}</span>
        </div>
      )}

      {/* Mobile: show current step label only */}
      <div className="sm:hidden flex items-center gap-3">
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold border-2 ${
            showWarning
              ? "bg-amber-100 border-amber-400 text-amber-700"
              : "bg-secondary border-secondary text-white"
          }`}
          aria-current="step"
        >
          {showWarning ? "!" : currentIndex + 1}
        </div>
        <div className="text-sm">
          <span
            className={`font-semibold ${
              showWarning ? "text-amber-700" : "text-secondary"
            }`}
          >
            {showWarning
              ? status.replace(/_/g, " ")
              : steps[currentIndex]}
          </span>
          <span className="text-gray-400 ml-1">
            Step {currentIndex + 1} of {steps.length}
          </span>
        </div>
      </div>
    </nav>
  );
}
