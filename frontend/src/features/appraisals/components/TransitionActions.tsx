/**
 * TransitionActions — Renders workflow transition buttons based on
 * the appraisal status and the current user's role relative to
 * the appraisal (appraisee, appraiser, or HR Admin).
 *
 * Uses ConfirmDialog (accessible modal) instead of window.confirm.
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { AppraisalStatus } from "@/types";
import { isAxiosError } from "axios";

export type UserRelation = "APPRAISEE" | "APPRAISER" | "HR_ADMIN" | "NONE";

const VERSION_CONFLICT_MESSAGE =
  "This appraisal was updated by another user. Please refresh.";

interface TransitionActionsProps {
  status: AppraisalStatus;
  userRelation: UserRelation;
  isHRAdmin?: boolean;
  onTransition: (toStatus: AppraisalStatus) => Promise<void>;
  onSign?: (action: "ACCEPT" | "REJECT", reason?: string) => Promise<void>;
  hasUserSigned?: boolean;
  onRefresh?: () => void;
}

interface TransitionButton {
  label: string;
  toStatus: AppraisalStatus;
  variant: "default" | "outline" | "destructive";
  confirmTitle: string;
  confirmMessage: string;
  signAction?: "ACCEPT" | "REJECT";
}

export function getButtons(
  status: AppraisalStatus,
  relation: UserRelation,
  isHRAdmin = false,
): TransitionButton[] {
  if (status === "SELF_ASSESSMENT" && relation === "APPRAISEE") {
    return [
      {
        label: "Submit Self-Assessment",
        toStatus: "MANAGER_REVIEW",
        variant: "default",
        confirmTitle: "Submit Self-Assessment",
        confirmMessage:
          "Submit your self-assessment and notify your manager?",
      },
    ];
  }
  if (status === "MANAGER_REVIEW" && relation === "APPRAISER") {
    return [
      {
        label: "Complete Manager Review",
        toStatus: "DISCUSSION",
        variant: "default",
        confirmTitle: "Complete Manager Review",
        confirmMessage: "Complete the manager review and proceed to discussion?",
      },
    ];
  }
  if (
    status === "DISCUSSION" &&
    (relation === "APPRAISEE" || relation === "APPRAISER")
  ) {
    return [
      {
        label: "Mark Discussion Complete",
        toStatus: "GROWTH_PLANNING",
        variant: "outline",
        confirmTitle: "Mark Discussion Complete",
        confirmMessage: "Mark the discussion as complete?",
      },
    ];
  }
  if (status === "GROWTH_PLANNING" && relation === "APPRAISER") {
    return [
      {
        label: "Submit for Sign-off",
        toStatus: "PENDING_SIGNOFF",
        variant: "default",
        confirmTitle: "Submit Growth Plan",
        confirmMessage: "Submit the growth plan and request sign-off?",
      },
    ];
  }
  if (
    status === "PENDING_SIGNOFF" &&
    (relation === "APPRAISEE" || relation === "APPRAISER")
  ) {
    return [
      {
        label: "Accept",
        toStatus: "SIGNED_OFF",
        variant: "default",
        confirmTitle: "Accept Appraisal",
        confirmMessage: "Accept and sign off this appraisal?",
        signAction: "ACCEPT",
      },
      {
        label: "Reject",
        toStatus: "DISPUTED",
        variant: "destructive",
        confirmTitle: "Reject Appraisal",
        confirmMessage: "Reject this appraisal and raise a dispute?",
        signAction: "REJECT",
      },
    ];
  }
  // `relation` is the user's role specific to this appraisal (e.g. APPRAISEE,
  // APPRAISER). `isHRAdmin` is a global role flag. An HR Admin who is also the
  // appraisee/appraiser on this appraisal will have relation !== "HR_ADMIN"
  // but isHRAdmin === true. Both checks are therefore necessary.
  if (status === "SIGNED_OFF" && (relation === "HR_ADMIN" || isHRAdmin)) {
    return [
      {
        label: "Finalise",
        toStatus: "FINALISED",
        variant: "default",
        confirmTitle: "Finalise Appraisal",
        confirmMessage: "Finalise this appraisal? This action cannot be undone.",
      },
    ];
  }
  if (status === "DISPUTED" && (relation === "HR_ADMIN" || isHRAdmin)) {
    return [
      {
        label: "Return to Discussion",
        toStatus: "DISCUSSION",
        variant: "outline",
        confirmTitle: "Return to Discussion",
        confirmMessage: "Return this appraisal to the discussion stage?",
      },
    ];
  }
  return [];
}

export function TransitionActions({
  status,
  userRelation,
  isHRAdmin = false,
  onTransition,
  onSign,
  hasUserSigned,
  onRefresh,
}: TransitionActionsProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingAction, setPendingAction] = useState<TransitionButton | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isVersionConflict, setIsVersionConflict] = useState(false);
  const buttons = getButtons(status, userRelation, isHRAdmin);

  const isRejectAction = pendingAction?.signAction === "REJECT";

  const handleConfirm = useCallback(async () => {
    if (!pendingAction) return;
    if (isRejectAction && !rejectReason.trim()) {
      setErrorMessage("Please provide a reason for rejection.");
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    setIsVersionConflict(false);
    try {
      if (pendingAction.signAction && onSign) {
        await onSign(pendingAction.signAction, isRejectAction ? rejectReason.trim() : undefined);
      } else {
        await onTransition(pendingAction.toStatus);
      }
    } catch (error: unknown) {
      if (isAxiosError(error) && error.response?.status === 409) {
        setErrorMessage(VERSION_CONFLICT_MESSAGE);
        setIsVersionConflict(true);
        onRefresh?.();
      } else if (isAxiosError(error)) {
        const respData = (error.response?.data as Record<string, unknown>)?.data ?? error.response?.data;
        const message = (respData as Record<string, unknown>)?.detail ?? (respData as Record<string, unknown>)?.message;
        setErrorMessage(typeof message === "string" ? message : "An unexpected error occurred.");
      } else {
        setErrorMessage("An unexpected error occurred.");
      }
    } finally {
      setIsSubmitting(false);
      setPendingAction(null);
      setRejectReason("");
    }
  }, [pendingAction, onTransition, onSign, onRefresh, isRejectAction, rejectReason]);

  const handleCancel = useCallback(() => {
    setPendingAction(null);
    setRejectReason("");
    setErrorMessage(null);
  }, []);

  if (buttons.length === 0) return null;

  // User has already signed — show waiting message instead of buttons
  if (status === "PENDING_SIGNOFF" && hasUserSigned) {
    return (
      <div className="flex justify-end mt-4">
        <span className="text-sm text-gray-500 italic">
          You have signed. Waiting for the other party to sign off.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2 flex-wrap mt-4">
        {buttons.map((btn) => (
          <Button
            key={btn.toStatus}
            size="sm"
            variant={btn.variant}
            disabled={isSubmitting}
            onClick={() => setPendingAction(btn)}
            className={
              btn.variant === "default"
                ? "bg-primary text-white hover:bg-primary-dark"
                : undefined
            }
          >
            {btn.label}
          </Button>
        ))}
      </div>

      {errorMessage !== null && (
        <Alert
          variant={isVersionConflict ? "warning" : "error"}
          className="mt-3"
        >
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>{errorMessage}</span>
            {isVersionConflict && onRefresh && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setErrorMessage(null);
                  setIsVersionConflict(false);
                  onRefresh();
                }}
              >
                Refresh
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <ConfirmDialog
        open={pendingAction !== null}
        title={pendingAction?.confirmTitle ?? ""}
        description={pendingAction?.confirmMessage ?? ""}
        confirmLabel={pendingAction?.label ?? "Confirm"}
        variant={pendingAction?.variant === "destructive" ? "destructive" : "default"}
        isLoading={isSubmitting}
        onConfirm={() => void handleConfirm()}
        onCancel={handleCancel}
      >
        {isRejectAction && (
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Please provide a reason for rejection..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            rows={3}
            aria-label="Reason for rejection"
          />
        )}
      </ConfirmDialog>
    </div>
  );
}
