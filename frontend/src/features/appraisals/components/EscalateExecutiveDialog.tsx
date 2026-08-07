/**
 * EscalateExecutiveDialog — Shared dialog for escalating a disputed
 * appraisal to an Executive (mode="escalate") or re-assigning an
 * already-escalated appraisal to a different Executive (mode="reassign").
 *
 * Visual contract: implements .claude/design/wireframes/EscalateExecutiveDialog.wireframe.tsx.
 * Behaviour contract: AC-10, AC-11, AC-12 of TASK-268.
 *
 * Submit is disabled while inputs are invalid (escalate mode also
 * requires reason >= 10 characters). HTTP 409 keeps the dialog open
 * and toasts a reload prompt; HTTP 400 field errors render inline.
 */

import { useState, useEffect, useCallback, useMemo, useId } from "react";
import { isAxiosError } from "axios";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ToastContainer } from "@/components/toast-container";
import {
  escalateAppraisal,
  reassignExecutive,
} from "@/api/appraisals";
import { listExecutiveUsers } from "@/api/admin-users";
import type { AdminUser, Appraisal } from "@/types";

const MIN_REASON_LENGTH = 10;
/**
 * Server-side cap on the `reason` field. Mirror this in the textarea
 * `maxLength` so the browser stops keystrokes past the limit instead of
 * relying on a 400 response. Keep in sync with the backend serializer.
 */
const MAX_REASON_LENGTH = 2000;

export interface EscalateExecutiveDialogProps {
  open: boolean;
  mode: "escalate" | "reassign";
  appraisalId: string;
  appraisalVersion: number;
  currentExecutive?: { id: string; full_name: string } | null;
  onClose: () => void;
  onSuccess: (updated: Appraisal) => void;
}

interface FieldErrors {
  executive_user_id?: string;
  reason?: string;
  form?: string;
}

/**
 * Extract DRF field-level errors out of a 400 response body.
 *
 * The standard envelope is `{ status: "error", data: { errors: { field: [...] } } }`.
 * We map the first message for each known field into our local state.
 */
function extractFieldErrors(err: unknown): FieldErrors {
  if (!isAxiosError(err) || err.response?.status !== 400) return {};
  const body = err.response.data as
    | { data?: { errors?: Record<string, unknown>; detail?: unknown } }
    | { errors?: Record<string, unknown>; detail?: unknown }
    | undefined;
  const envelopeErrors =
    (body as { data?: { errors?: Record<string, unknown> } } | undefined)?.data
      ?.errors ?? (body as { errors?: Record<string, unknown> } | undefined)?.errors;
  const errors: FieldErrors = {};
  if (envelopeErrors && typeof envelopeErrors === "object") {
    const exec = envelopeErrors.executive_user_id;
    if (Array.isArray(exec) && typeof exec[0] === "string") {
      errors.executive_user_id = exec[0];
    } else if (typeof exec === "string") {
      errors.executive_user_id = exec;
    }
    const reason = envelopeErrors.reason;
    if (Array.isArray(reason) && typeof reason[0] === "string") {
      errors.reason = reason[0];
    } else if (typeof reason === "string") {
      errors.reason = reason;
    }
  }
  if (Object.keys(errors).length === 0) {
    const detail =
      (body as { data?: { detail?: unknown } } | undefined)?.data?.detail ??
      (body as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === "string") errors.form = detail;
  }
  return errors;
}

export function EscalateExecutiveDialog({
  open,
  mode,
  appraisalId,
  appraisalVersion,
  currentExecutive,
  onClose,
  onSuccess,
}: EscalateExecutiveDialogProps) {
  const toast = useToast();
  const reactId = useId();
  const execPickerId = `${reactId}-exec`;
  const reasonId = `${reactId}-reason`;

  const [executives, setExecutives] = useState<AdminUser[]>([]);
  const [isLoadingExecs, setIsLoadingExecs] = useState(false);
  const [execsError, setExecsError] = useState<string | null>(null);
  const [selectedExecId, setSelectedExecId] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Reset transient state and fetch executives when the dialog opens.
  //
  // Skip the reset if a submission is in flight — otherwise a `currentExecutive`
  // prop change (e.g. parent re-render after `onSuccess`) would wipe the
  // user's selection mid-submit and confuse the toast/success copy.
  useEffect(() => {
    if (!open) return;
    if (isSubmitting) return;
    setReason("");
    setFieldErrors({});
    setIsSubmitting(false);
    setSelectedExecId(currentExecutive?.id ?? "");
    setIsLoadingExecs(true);
    setExecsError(null);
    let cancelled = false;
    listExecutiveUsers()
      .then((users) => {
        if (cancelled) return;
        setExecutives(users);
      })
      .catch(() => {
        if (cancelled) return;
        setExecsError("Failed to load Executives. Please close and retry.");
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingExecs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, currentExecutive]);

  const charCount = reason.length;
  const isReasonValid = mode === "reassign" || charCount >= MIN_REASON_LENGTH;
  const isExecValid = Boolean(selectedExecId);
  const isSubmitDisabled =
    !isExecValid || !isReasonValid || isSubmitting || isLoadingExecs;

  const title = mode === "escalate" ? "Escalate to Executive" : "Re-assign Executive";
  const submitLabel = mode === "escalate" ? "Confirm Escalation" : "Confirm Re-assignment";

  const selectedExecName = useMemo(() => {
    const match = executives.find((e) => e.id === selectedExecId);
    return match?.full_name ?? "the selected Executive";
  }, [executives, selectedExecId]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitDisabled) return;
    setIsSubmitting(true);
    setFieldErrors({});
    try {
      const updated =
        mode === "escalate"
          ? await escalateAppraisal(appraisalId, {
              executive_user_id: selectedExecId,
              reason,
              version: appraisalVersion,
            })
          : await reassignExecutive(appraisalId, {
              executive_user_id: selectedExecId,
              version: appraisalVersion,
            });
      const successMessage =
        mode === "escalate"
          ? `Appraisal escalated to ${selectedExecName}`
          : `Executive re-assigned to ${selectedExecName}`;
      toast.success(successMessage);
      onSuccess(updated);
      onClose();
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response?.status === 409) {
        toast.error(
          "This appraisal was recently updated — please reload and try again.",
        );
        return;
      }
      const errors = extractFieldErrors(err);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
      toast.error(
        mode === "escalate"
          ? "Failed to escalate appraisal. Please try again."
          : "Failed to re-assign Executive. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitDisabled,
    mode,
    appraisalId,
    appraisalVersion,
    selectedExecId,
    reason,
    selectedExecName,
    toast,
    onSuccess,
    onClose,
  ]);

  if (!open) return null;

  const execError = fieldErrors.executive_user_id;
  const reasonError = fieldErrors.reason;
  const formError = fieldErrors.form;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent
          className="max-w-lg w-full mx-4 sm:mx-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${reactId}-title`}
        >
          <DialogHeader>
            <DialogTitle
              id={`${reactId}-title`}
              className="text-lg font-semibold text-gray-900"
            >
              {title}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {execsError && (
              <div
                role="alert"
                className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {execsError}
              </div>
            )}

            {/* Executive picker */}
            <div>
              <label
                htmlFor={execPickerId}
                className="block text-sm font-medium text-gray-900 mb-1"
              >
                Executive{" "}
                <span className="text-red-600" aria-hidden="true">
                  *
                </span>
              </label>
              <Select
                id={execPickerId}
                aria-required="true"
                aria-describedby={
                  execError ? `${execPickerId}-error` : `${execPickerId}-hint`
                }
                value={selectedExecId}
                disabled={isLoadingExecs || isSubmitting}
                className={execError ? "border-red-300 focus-visible:ring-red-200" : ""}
                onChange={(e) => setSelectedExecId(e.target.value)}
              >
                <option value="" disabled>
                  {isLoadingExecs ? "Loading Executives…" : "Select an Executive…"}
                </option>
                {executives.map((exec) => (
                  <option key={exec.id} value={exec.id}>
                    {exec.full_name}
                  </option>
                ))}
              </Select>
              <p
                id={`${execPickerId}-hint`}
                className="mt-1 text-xs text-gray-500"
              >
                {mode === "reassign"
                  ? "The original escalation reason is preserved and does not need to be re-entered."
                  : "Only active Executives are listed."}
              </p>
              {execError && (
                <p
                  id={`${execPickerId}-error`}
                  role="alert"
                  className="mt-1 text-sm text-red-600"
                >
                  {execError}
                </p>
              )}
            </div>

            {/* Reason — escalate mode only */}
            {mode === "escalate" && (
              <div>
                <label
                  htmlFor={reasonId}
                  className="block text-sm font-medium text-gray-900 mb-1"
                >
                  Reason for escalation{" "}
                  <span className="text-red-600" aria-hidden="true">
                    *
                  </span>
                </label>
                <Textarea
                  id={reasonId}
                  rows={4}
                  maxLength={MAX_REASON_LENGTH}
                  placeholder="Describe why this appraisal is being escalated to an Executive…"
                  className={`resize-none ${reasonError ? "border-red-300" : ""}`}
                  aria-required="true"
                  aria-describedby={`${reasonId}-hint ${reasonId}-counter${
                    reasonError ? ` ${reasonId}-error` : ""
                  }`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={isSubmitting}
                />
                <div className="mt-1 flex items-center justify-between">
                  <p
                    id={`${reasonId}-hint`}
                    className="text-xs text-gray-500"
                  >
                    Minimum {MIN_REASON_LENGTH} characters
                  </p>
                  <span
                    id={`${reasonId}-counter`}
                    aria-live="polite"
                    aria-atomic="true"
                    className={`text-xs tabular-nums ${
                      charCount >= MIN_REASON_LENGTH
                        ? "text-gray-500"
                        : "text-amber-700 font-medium"
                    }`}
                  >
                    {charCount} / {MAX_REASON_LENGTH}
                  </span>
                </div>
                {reasonError && (
                  <p
                    id={`${reasonId}-error`}
                    role="alert"
                    className="mt-1 text-sm text-red-600"
                  >
                    {reasonError}
                  </p>
                )}
              </div>
            )}

            {formError && (
              <div
                role="alert"
                className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {formError}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              aria-disabled={isSubmitDisabled}
              disabled={isSubmitDisabled}
              onClick={() => void handleSubmit()}
              className="bg-primary text-white hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Submitting…" : submitLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
    </>
  );
}
