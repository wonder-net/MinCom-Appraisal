/**
 * AppraisalDetailHeader — Header card with employee info, workflow
 * stepper, transition actions, and score summary panel.
 */

import { AppraisalStatusBadge } from "./AppraisalStatusBadge";
import { WorkflowStepper } from "./WorkflowStepper";
import { ScoreSummaryPanel } from "./ScoreSummaryPanel";
import { TransitionActions } from "./TransitionActions";
import type { Appraisal, AppraisalStatus } from "@/types";

type UserRelation = "APPRAISEE" | "APPRAISER" | "HR_ADMIN" | "NONE";

interface AppraisalDetailHeaderProps {
  appraisal: Appraisal;
  userRelation: UserRelation;
  isHRAdmin: boolean;
  onTransition: (toStatus: AppraisalStatus) => Promise<void>;
  onSign?: (action: "ACCEPT" | "REJECT", reason?: string) => Promise<void>;
  hasUserSigned?: boolean;
  onRefresh?: () => void;
  canExportPDF: boolean;
  isGeneratingPDF?: boolean;
  onDownloadPDF?: () => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function AppraisalDetailHeader({
  appraisal,
  userRelation,
  isHRAdmin,
  onTransition,
  onSign,
  hasUserSigned,
  onRefresh,
  canExportPDF,
  isGeneratingPDF,
  onDownloadPDF,
}: AppraisalDetailHeaderProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
        {/* Employee info */}
        <div className="flex items-start gap-4">
          {appraisal.employee_photo_url ? (
            <img
              src={appraisal.employee_photo_url}
              alt=""
              className="h-12 w-12 flex-shrink-0 rounded-full object-cover border border-gray-200"
            />
          ) : (
            <div
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary text-white font-semibold text-lg"
              aria-hidden="true"
            >
              {getInitials(appraisal.employee_name)}
            </div>
          )}
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {appraisal.employee_name}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {appraisal.employee_job_title}
              {appraisal.department_full_label || appraisal.department ? (
                <> &middot; {appraisal.department_full_label ?? appraisal.department}</>
              ) : null}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="text-xs font-mono border border-gray-300 rounded px-2 py-0.5 text-gray-600">
                {appraisal.form_type === "FORM_A" ? "Managerial" : "Non-Managerial"}
              </span>
              <AppraisalStatusBadge status={appraisal.status} />
            </div>
            {canExportPDF && (
              <div className="mt-3">
                <button
                  type="button"
                  className="h-8 px-3 rounded border border-gray-300 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label={`Download appraisal PDF for ${appraisal.employee_name}`}
                  onClick={onDownloadPDF}
                  disabled={isGeneratingPDF}
                >
                  {isGeneratingPDF ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
                      Generating PDF...
                    </span>
                  ) : (
                    "Download PDF"
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Stepper + transition actions */}
        <div>
          <WorkflowStepper status={appraisal.status} selfRatingEnabled={appraisal.self_rating_enabled ?? true} />
          <div className="mt-4 flex justify-end">
            <TransitionActions
              status={appraisal.status}
              userRelation={userRelation}
              isHRAdmin={isHRAdmin}
              onTransition={onTransition}
              onSign={onSign}
              hasUserSigned={hasUserSigned}
              onRefresh={onRefresh}
            />
          </div>
        </div>

        {/* Score summary */}
        <ScoreSummaryPanel
          kdAverage={appraisal.kd_average_score}
          kdDescriptor={appraisal.kd_descriptor}
          bcAverage={appraisal.bc_average_score}
          bcDescriptor={appraisal.bc_descriptor}
          totalScore={appraisal.total_score}
          performanceDescriptor={appraisal.performance_descriptor}
          status={appraisal.status}
        />
      </div>
    </div>
  );
}
